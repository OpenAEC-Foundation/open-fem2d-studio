// GEGENEREERD BESTAND — niet met de hand aanpassen.
// Bron: design-mockup/src/mcp/kernel-exports.ts
// Herbouwen: npm run build:sidecar (in design-mockup/)

// src/core/fem/Material.ts
var DEFAULT_MATERIALS = [
  {
    id: 1,
    name: "Steel",
    E: 21e10,
    // 210 GPa
    nu: 0.3,
    rho: 7850,
    // kg/m³
    color: "#3b82f6",
    alpha: 12e-6
    // 1/°C
  },
  {
    id: 2,
    name: "Aluminum",
    E: 7e10,
    // 70 GPa
    nu: 0.33,
    rho: 2700,
    color: "#a855f7",
    alpha: 23e-6
  },
  {
    id: 3,
    name: "Concrete",
    E: 3e10,
    // 30 GPa
    nu: 0.2,
    rho: 2400,
    color: "#6b7280",
    alpha: 1e-5
  },
  {
    id: 4,
    name: "Wood",
    E: 12e9,
    // 12 GPa
    nu: 0.3,
    rho: 600,
    color: "#92400e",
    alpha: 5e-6
  },
  {
    id: 5,
    name: "Custom",
    E: 2e11,
    nu: 0.3,
    rho: 7800,
    color: "#10b981",
    alpha: 12e-6
  }
];

// src/core/math/Matrix.ts
var Matrix = class _Matrix {
  data;
  rows;
  cols;
  constructor(rows, cols, fill = 0) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(rows).fill(null).map(() => Array(cols).fill(fill));
  }
  static fromArray(arr) {
    const m = new _Matrix(arr.length, arr[0].length);
    m.data = arr.map((row) => [...row]);
    return m;
  }
  static identity(size) {
    const m = new _Matrix(size, size);
    for (let i = 0; i < size; i++) {
      m.data[i][i] = 1;
    }
    return m;
  }
  static zeros(rows, cols) {
    return new _Matrix(rows, cols, 0);
  }
  get(row, col) {
    return this.data[row][col];
  }
  set(row, col, value) {
    this.data[row][col] = value;
  }
  add(other) {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error("Matrix dimensions must match for addition");
    }
    const result = new _Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] + other.data[i][j];
      }
    }
    return result;
  }
  subtract(other) {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error("Matrix dimensions must match for subtraction");
    }
    const result = new _Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] - other.data[i][j];
      }
    }
    return result;
  }
  multiply(other) {
    if (this.cols !== other.rows) {
      throw new Error(`Cannot multiply ${this.rows}x${this.cols} by ${other.rows}x${other.cols}`);
    }
    const result = new _Matrix(this.rows, other.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[i][k] * other.data[k][j];
        }
        result.data[i][j] = sum;
      }
    }
    return result;
  }
  multiplyVector(v) {
    if (this.cols !== v.length) {
      throw new Error("Matrix columns must match vector length");
    }
    const result = new Array(this.rows).fill(0);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result[i] += this.data[i][j] * v[j];
      }
    }
    return result;
  }
  scale(scalar) {
    const result = new _Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] * scalar;
      }
    }
    return result;
  }
  transpose() {
    const result = new _Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j][i] = this.data[i][j];
      }
    }
    return result;
  }
  clone() {
    const result = new _Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j];
      }
    }
    return result;
  }
  addAt(row, col, value) {
    this.data[row][col] += value;
  }
  getRow(row) {
    return [...this.data[row]];
  }
  getCol(col) {
    return this.data.map((row) => row[col]);
  }
  setRow(row, values) {
    this.data[row] = [...values];
  }
  setCol(col, values) {
    for (let i = 0; i < this.rows; i++) {
      this.data[i][col] = values[i];
    }
  }
  toString() {
    return this.data.map((row) => row.map((v) => v.toFixed(4)).join("	")).join("\n");
  }
};

// src/core/fem/Beam.ts
function calculateBeamLength(n1, n2) {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function calculateBeamAngle(n1, n2) {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  return Math.atan2(dy, dx);
}
function calculateBeamLocalStiffness(L, E, A, I) {
  const Ke = new Matrix(6, 6);
  const EA_L = E * A / L;
  const EI_L3 = E * I / (L * L * L);
  const EI_L2 = E * I / (L * L);
  const EI_L = E * I / L;
  Ke.set(0, 0, EA_L);
  Ke.set(0, 3, -EA_L);
  Ke.set(3, 0, -EA_L);
  Ke.set(3, 3, EA_L);
  Ke.set(1, 1, 12 * EI_L3);
  Ke.set(1, 2, 6 * EI_L2);
  Ke.set(2, 1, 6 * EI_L2);
  Ke.set(1, 4, -12 * EI_L3);
  Ke.set(4, 1, -12 * EI_L3);
  Ke.set(1, 5, 6 * EI_L2);
  Ke.set(5, 1, 6 * EI_L2);
  Ke.set(2, 2, 4 * EI_L);
  Ke.set(2, 4, -6 * EI_L2);
  Ke.set(4, 2, -6 * EI_L2);
  Ke.set(2, 5, 2 * EI_L);
  Ke.set(5, 2, 2 * EI_L);
  Ke.set(4, 4, 12 * EI_L3);
  Ke.set(4, 5, -6 * EI_L2);
  Ke.set(5, 4, -6 * EI_L2);
  Ke.set(5, 5, 4 * EI_L);
  return Ke;
}
function createTransformationMatrix(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const T = new Matrix(6, 6);
  T.set(0, 0, c);
  T.set(0, 1, s);
  T.set(1, 0, -s);
  T.set(1, 1, c);
  T.set(2, 2, 1);
  T.set(3, 3, c);
  T.set(3, 4, s);
  T.set(4, 3, -s);
  T.set(4, 4, c);
  T.set(5, 5, 1);
  return T;
}
function calculateBeamGlobalStiffness(n1, n2, material, section) {
  const L = calculateBeamLength(n1, n2);
  const angle = calculateBeamAngle(n1, n2);
  if (L < 1e-10) {
    throw new Error("Beam element has zero length");
  }
  const Kl = calculateBeamLocalStiffness(L, material.E, section.A, section.I);
  const T = createTransformationMatrix(angle);
  const TT = T.transpose();
  const temp = Kl.multiply(T);
  const Kg = TT.multiply(temp);
  return Kg;
}
function calculateDistributedLoadVector(L, qx, qy) {
  return [
    qx * L / 2,
    // Fx1
    qy * L / 2,
    // Fy1
    qy * L * L / 12,
    // M1
    qx * L / 2,
    // Fx2
    qy * L / 2,
    // Fy2
    -qy * L * L / 12
    // M2
  ];
}
function calculatePartialDistributedLoadVector(L, qx, qy, startT, endT) {
  const a = startT;
  const b = endT;
  const span = (b - a) * L;
  const La = a * L;
  const Lb = b * L;
  const intN1 = integrate_N1(La, Lb, L);
  const intN2 = integrate_N2(La, Lb, L);
  const intN3 = integrate_N3(La, Lb, L);
  const intN4 = integrate_N4(La, Lb, L);
  const intL1 = span * (1 - (a + b) / 2);
  const intL2 = span * (a + b) / 2;
  return [
    qx * intL1,
    // Fx1
    qy * intN1,
    // Fy1
    qy * intN2,
    // M1
    qx * intL2,
    // Fx2
    qy * intN3,
    // Fy2
    qy * intN4
    // M2
  ];
}
function integrate_N1(a, b, L) {
  const eval_at = (x) => x - x * x * x / (L * L) + x * x * x * x / (2 * L * L * L);
  return eval_at(b) - eval_at(a);
}
function integrate_N2(a, b, L) {
  const eval_at = (x) => x * x / 2 - 2 * x * x * x / (3 * L) + x * x * x * x / (4 * L * L);
  return eval_at(b) - eval_at(a);
}
function integrate_N3(a, b, L) {
  const eval_at = (x) => x * x * x / (L * L) - x * x * x * x / (2 * L * L * L);
  return eval_at(b) - eval_at(a);
}
function integrate_N4(a, b, L) {
  const eval_at = (x) => -x * x * x / (3 * L) + x * x * x * x / (4 * L * L);
  return eval_at(b) - eval_at(a);
}
function calculateTrapezoidalLoadVector(L, qxStart, qyStart, qxEnd, qyEnd) {
  const dqy = qyEnd - qyStart;
  const dqx = qxEnd - qxStart;
  return [
    qxStart * L / 2 + dqx * L / 6,
    // Fx1
    qyStart * L / 2 + 3 * dqy * L / 20,
    // Fy1
    qyStart * L * L / 12 + dqy * L * L / 30,
    // M1
    qxStart * L / 2 + dqx * L / 3,
    // Fx2
    qyStart * L / 2 + 7 * dqy * L / 20,
    // Fy2
    -qyStart * L * L / 12 - dqy * L * L / 20
    // M2
  ];
}
function calculatePartialTrapezoidalLoadVector(L, qxStart, qyStart, qxEnd, qyEnd, startT, endT) {
  const La = startT * L;
  const Lb = endT * L;
  const span = Lb - La;
  if (span <= 0) return [0, 0, 0, 0, 0, 0];
  const n = 20;
  const h = span / n;
  const F = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const x = La + i * h;
    const t = span > 0 ? (x - La) / span : 0;
    const qy_x = qyStart + (qyEnd - qyStart) * t;
    const qx_x = qxStart + (qxEnd - qxStart) * t;
    const xi = x / L;
    const N1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
    const N2 = x * (1 - xi) * (1 - xi);
    const N3 = 3 * xi * xi - 2 * xi * xi * xi;
    const N4 = x * xi * (xi - 1);
    const L1 = 1 - xi;
    const L2 = xi;
    let w;
    if (i === 0 || i === n) w = 1;
    else if (i % 2 === 1) w = 4;
    else w = 2;
    F[0] += w * qx_x * L1;
    F[1] += w * qy_x * N1;
    F[2] += w * qy_x * N2;
    F[3] += w * qx_x * L2;
    F[4] += w * qy_x * N3;
    F[5] += w * qy_x * N4;
  }
  const factor = h / 3;
  for (let i = 0; i < 6; i++) {
    F[i] *= factor;
  }
  return F;
}
function projectDistributedLoadToLocal(load, angle) {
  let qxS = load.qx;
  let qyS = load.qy;
  let qxE = load.qxEnd ?? qxS;
  let qyE = load.qyEnd ?? qyS;
  const coordSystem = load.coordSystem ?? "local";
  const startT = load.startT ?? 0;
  const endT = load.endT ?? 1;
  if (coordSystem === "global") {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const qxSL = qxS * cos + qyS * sin;
    const qySL = -qxS * sin + qyS * cos;
    const qxEL = qxE * cos + qyE * sin;
    const qyEL = -qxE * sin + qyE * cos;
    qxS = qxSL;
    qyS = qySL;
    qxE = qxEL;
    qyE = qyEL;
  }
  return { qxS, qyS, qxE, qyE, startT, endT };
}
function calculateDistributedLoadLocalForces(L, angle, load) {
  const { qxS, qyS, qxE, qyE, startT, endT } = projectDistributedLoadToLocal(load, angle);
  const isTrapezoidal = qxE !== qxS || qyE !== qyS;
  const isPartial = startT > 0 || endT < 1;
  if (isTrapezoidal) {
    return isPartial ? calculatePartialTrapezoidalLoadVector(L, qxS, qyS, qxE, qyE, startT, endT) : calculateTrapezoidalLoadVector(L, qxS, qyS, qxE, qyE);
  }
  if (isPartial) {
    return calculatePartialDistributedLoadVector(L, qxS, qyS, startT, endT);
  }
  return calculateDistributedLoadVector(L, qxS, qyS);
}
function transformLocalToGlobal(localForces, angle) {
  const T = createTransformationMatrix(angle);
  const TT = T.transpose();
  const result = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      result[i] += TT.get(i, j) * localForces[j];
    }
  }
  return result;
}
function transformGlobalToLocal(globalDisp, angle) {
  const T = createTransformationMatrix(angle);
  const result = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      result[i] += T.get(i, j) * globalDisp[j];
    }
  }
  return result;
}
var DEFAULT_SECTIONS = [
  {
    name: "IPE 100",
    section: { A: 103e-5, I: 171e-8, h: 0.1, Iy: 171e-8, Iz: 159e-9, Wy: 342e-7, Wz: 579e-8, Wply: 394e-7, Wplz: 915e-8 }
  },
  {
    name: "IPE 200",
    section: { A: 285e-5, I: 194e-7, h: 0.2, Iy: 194e-7, Iz: 142e-8, Wy: 194e-6, Wz: 285e-7, Wply: 221e-6, Wplz: 446e-7 }
  },
  {
    name: "IPE 300",
    section: { A: 538e-5, I: 836e-7, h: 0.3, Iy: 836e-7, Iz: 604e-8, Wy: 557e-6, Wz: 805e-7, Wply: 628e-6, Wplz: 125e-6 }
  },
  {
    name: "HEA 100",
    section: { A: 212e-5, I: 349e-8, h: 0.096, Iy: 349e-8, Iz: 134e-8, Wy: 728e-7, Wz: 268e-7, Wply: 83e-6, Wplz: 411e-7 }
  },
  {
    name: "HEA 200",
    section: { A: 538e-5, I: 369e-7, h: 0.19, Iy: 369e-7, Iz: 134e-7, Wy: 389e-6, Wz: 134e-6, Wply: 43e-5, Wplz: 204e-6 }
  },
  {
    // b=100mm, h=200mm: Iy=bh³/12, Iz=hb³/12, Wy=bh²/6, Wz=hb²/6, Wply=bh²/4, Wplz=hb²/4
    name: "Rectangle 100x200",
    section: { A: 0.02, I: 6667e-8, h: 0.2, Iy: 6667e-8, Iz: 1667e-8, Wy: 6667e-7, Wz: 3333e-7, Wply: 1e-3, Wplz: 5e-4 }
  },
  {
    // b=200mm, h=400mm
    name: "Rectangle 200x400",
    section: { A: 0.08, I: 1067e-6, h: 0.4, Iy: 1067e-6, Iz: 2667e-7, Wy: 5333e-6, Wz: 2667e-6, Wply: 8e-3, Wplz: 4e-3 }
  },
  {
    // D=100mm, t=5mm → d=90mm; Iy=Iz=π(D⁴-d⁴)/64, Wy=Wz=π(D⁴-d⁴)/(32D)
    name: "Tube 100x5",
    section: { A: 1492e-6, I: 168e-8, h: 0.1, Iy: 168e-8, Iz: 168e-8, Wy: 336e-7, Wz: 336e-7, Wply: 443e-7, Wplz: 443e-7 }
  }
];

// src/core/fem/Mesh.ts
var Mesh = class _Mesh {
  nodes;
  elements;
  beamElements;
  materials;
  sections;
  plateRegions;
  subNodes;
  edges;
  layers;
  plateVertices;
  nextNodeId;
  nextElementId;
  nextMaterialId;
  nextPlateId;
  nextPlateNodeId;
  nextSubNodeId;
  nextEdgeId;
  nextLayerId;
  nextVertexId;
  constructor() {
    this.nodes = /* @__PURE__ */ new Map();
    this.elements = /* @__PURE__ */ new Map();
    this.beamElements = /* @__PURE__ */ new Map();
    this.materials = /* @__PURE__ */ new Map();
    this.sections = /* @__PURE__ */ new Map();
    this.plateRegions = /* @__PURE__ */ new Map();
    this.subNodes = /* @__PURE__ */ new Map();
    this.edges = /* @__PURE__ */ new Map();
    this.layers = /* @__PURE__ */ new Map();
    this.plateVertices = /* @__PURE__ */ new Map();
    this.nextNodeId = 1;
    this.nextElementId = 1;
    this.nextMaterialId = 10;
    this.nextPlateId = 1;
    this.nextPlateNodeId = 1e3;
    this.nextSubNodeId = 1;
    this.nextEdgeId = 1;
    this.nextLayerId = 1;
    this.nextVertexId = 1;
    DEFAULT_MATERIALS.forEach((m) => this.materials.set(m.id, { ...m }));
    DEFAULT_SECTIONS.forEach((s) => this.sections.set(s.name, s.section));
    this.layers.set(0, { id: 0, name: "Default", color: "#3b82f6", visible: true, locked: false });
  }
  addNode(x, y) {
    while (this.nodes.has(this.nextNodeId)) this.nextNodeId++;
    const node = {
      id: this.nextNodeId++,
      x,
      y,
      constraints: { x: false, y: false, rotation: false },
      loads: { fx: 0, fy: 0, moment: 0 }
    };
    this.nodes.set(node.id, node);
    return node;
  }
  /**
   * Plaatknoop toevoegen. De nummering begint op 1000 óf, als er al meer
   * reguliere knopen zijn, boven het hoogste reguliere id; een bestaand id
   * wordt overgeslagen.
   *
   * Tot september 2026 begon de plaatteller altijd op 1000 en overschreef hij
   * stil een reguliere knoop zodra het model er 1000 of meer had (reguliere
   * knopen: staafknopen, splitsknopen van staafpuntlasten en plaatranden).
   * Gemeten: raamwerk 32 traveeën × 30 lagen (1023 knopen) met een losse
   * wandschijf — vijf botsingen, ΣRx −300 → −154,2 kN, ux 58,33 → 4,33 mm,
   * zonder melding. De `Map` gaf de knoop gewoon een nieuwe plek; de staven
   * wezen naar een punt elders.
   */
  addPlateNode(x, y) {
    if (this.nextPlateNodeId < this.nextNodeId) this.nextPlateNodeId = this.nextNodeId;
    while (this.nodes.has(this.nextPlateNodeId)) this.nextPlateNodeId++;
    const node = {
      id: this.nextPlateNodeId++,
      x,
      y,
      constraints: { x: false, y: false, rotation: false },
      loads: { fx: 0, fy: 0, moment: 0 }
    };
    this.nodes.set(node.id, node);
    return node;
  }
  removeNode(id) {
    if (!this.nodes.has(id)) return false;
    const platesToRemove = [];
    for (const [plateId, plate] of this.plateRegions) {
      if (plate.nodeIds.includes(id)) {
        platesToRemove.push(plateId);
      }
    }
    for (const plateId of platesToRemove) {
      const plate = this.plateRegions.get(plateId);
      if (plate) {
        for (const elemId of plate.elementIds) {
          this.elements.delete(elemId);
        }
        for (const nodeId of plate.nodeIds) {
          if (nodeId !== id) {
            let usedElsewhere = false;
            for (const beam of this.beamElements.values()) {
              if (beam.nodeIds.includes(nodeId)) {
                usedElsewhere = true;
                break;
              }
            }
            if (!usedElsewhere) {
              for (const [pid, otherPlate] of this.plateRegions) {
                if (pid !== plateId && otherPlate.nodeIds.includes(nodeId)) {
                  usedElsewhere = true;
                  break;
                }
              }
            }
            if (!usedElsewhere) {
              for (const elem of this.elements.values()) {
                if (elem.nodeIds.includes(nodeId)) {
                  usedElsewhere = true;
                  break;
                }
              }
            }
            if (!usedElsewhere) {
              this.nodes.delete(nodeId);
            }
          }
        }
        this.plateRegions.delete(plateId);
      }
    }
    for (const [elemId, element] of this.elements) {
      if (element.nodeIds.includes(id)) {
        this.elements.delete(elemId);
      }
    }
    for (const [beamId, beam] of this.beamElements) {
      if (beam.nodeIds.includes(id)) {
        this.beamElements.delete(beamId);
      }
    }
    const subNodesToRemove = [];
    for (const [snId, sn] of this.subNodes) {
      if (sn.nodeId === id || sn.originalBeamStart === id || sn.originalBeamEnd === id) {
        subNodesToRemove.push(snId);
      }
    }
    for (const snId of subNodesToRemove) {
      this.subNodes.delete(snId);
    }
    return this.nodes.delete(id);
  }
  updateNode(id, updates) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const updated = { ...node, ...updates, id };
    this.nodes.set(id, updated);
    return updated;
  }
  addTriangleElement(nodeIds, materialId = 1, thickness = 0.01) {
    for (const nodeId of nodeIds) {
      if (!this.nodes.has(nodeId)) return null;
    }
    if (!this.materials.has(materialId)) {
      materialId = 1;
    }
    const element = {
      id: this.nextElementId++,
      nodeIds,
      materialId,
      thickness
    };
    this.elements.set(element.id, element);
    return element;
  }
  addQuadElement(nodeIds, materialId = 1, thickness = 0.01) {
    for (const nodeId of nodeIds) {
      if (!this.nodes.has(nodeId)) return null;
    }
    if (!this.materials.has(materialId)) {
      materialId = 1;
    }
    const element = {
      id: this.nextElementId++,
      nodeIds,
      materialId,
      thickness
    };
    this.elements.set(element.id, element);
    return element;
  }
  removeElement(id) {
    if (this.elements.delete(id)) {
      this.removeOrphanNodes();
      return true;
    }
    if (this.beamElements.delete(id)) {
      this.removeOrphanNodes();
      return true;
    }
    return false;
  }
  /**
   * Find and remove all nodes that are not referenced by any element
   * (beamElements, elements) or plate region.
   * @returns Array of removed node IDs
   */
  removeOrphanNodes() {
    const referencedNodeIds = /* @__PURE__ */ new Set();
    for (const beam of this.beamElements.values()) {
      for (const nodeId of beam.nodeIds) {
        referencedNodeIds.add(nodeId);
      }
    }
    for (const element of this.elements.values()) {
      for (const nodeId of element.nodeIds) {
        referencedNodeIds.add(nodeId);
      }
    }
    for (const plate of this.plateRegions.values()) {
      for (const nodeId of plate.nodeIds) {
        referencedNodeIds.add(nodeId);
      }
    }
    const orphanIds = [];
    for (const nodeId of this.nodes.keys()) {
      if (!referencedNodeIds.has(nodeId)) {
        orphanIds.push(nodeId);
      }
    }
    for (const nodeId of orphanIds) {
      this.nodes.delete(nodeId);
    }
    return orphanIds;
  }
  addBeamElement(nodeIds, materialId = 1, section = { A: 538e-5, I: 836e-7, h: 0.3 }, profileName) {
    for (const nodeId of nodeIds) {
      if (!this.nodes.has(nodeId)) return null;
    }
    if (!this.materials.has(materialId)) {
      materialId = 1;
    }
    const element = {
      id: this.nextElementId++,
      nodeIds,
      materialId,
      thickness: 1,
      // Not used for beams, but required by IElement
      section,
      profileName
    };
    this.beamElements.set(element.id, element);
    return element;
  }
  getBeamElement(id) {
    return this.beamElements.get(id);
  }
  updateBeamElement(id, updates) {
    const element = this.beamElements.get(id);
    if (!element) return null;
    const updated = { ...element, ...updates, id };
    this.beamElements.set(id, updated);
    return updated;
  }
  getBeamElementNodes(element) {
    const n1 = this.nodes.get(element.nodeIds[0]);
    const n2 = this.nodes.get(element.nodeIds[1]);
    if (!n1 || !n2) return null;
    return [n1, n2];
  }
  getBeamCount() {
    return this.beamElements.size;
  }
  updateElement(id, updates) {
    const element = this.elements.get(id);
    if (!element) return null;
    const updated = { ...element, ...updates, id };
    this.elements.set(id, updated);
    return updated;
  }
  addMaterial(material) {
    const newMaterial = {
      ...material,
      id: this.nextMaterialId++
    };
    this.materials.set(newMaterial.id, newMaterial);
    return newMaterial;
  }
  getNode(id) {
    return this.nodes.get(id);
  }
  getElement(id) {
    return this.elements.get(id);
  }
  getMaterial(id) {
    return this.materials.get(id);
  }
  getNodeCount() {
    return this.nodes.size;
  }
  getElementCount() {
    return this.elements.size;
  }
  /**
   * Split a beam at a given position and optionally apply a point load there
   * @param beamId - ID of the beam to split
   * @param position - Position along beam (0 to 1, where 0 = start, 1 = end)
   * @param load - Optional load to apply at the split point {fx, fy, moment}
   * @returns The new node at the split point, or null if failed
   */
  splitBeamAt(beamId, position, load) {
    const beam = this.beamElements.get(beamId);
    if (!beam) return null;
    position = Math.max(0.01, Math.min(0.99, position));
    const nodes = this.getBeamElementNodes(beam);
    if (!nodes) return null;
    const [n1, n2] = nodes;
    const newX = n1.x + position * (n2.x - n1.x);
    const newY = n1.y + position * (n2.y - n1.y);
    const existingNode = this.findNodeAt(newX, newY, 0.01);
    if (existingNode) {
      if (load) {
        this.updateNode(existingNode.id, {
          loads: {
            fx: existingNode.loads.fx + load.fx,
            fy: existingNode.loads.fy + load.fy,
            moment: existingNode.loads.moment + load.moment
          }
        });
      }
      return existingNode;
    }
    const newNode = this.addNode(newX, newY);
    if (load) {
      this.updateNode(newNode.id, {
        loads: { fx: load.fx, fy: load.fy, moment: load.moment }
      });
    }
    const { materialId, section, distributedLoad, profileName } = beam;
    this.beamElements.delete(beamId);
    const beam1 = this.addBeamElement([n1.id, newNode.id], materialId, section, profileName);
    const beam2 = this.addBeamElement([newNode.id, n2.id], materialId, section, profileName);
    if (distributedLoad && beam1 && beam2) {
      this.updateBeamElement(beam1.id, { distributedLoad });
      this.updateBeamElement(beam2.id, { distributedLoad });
    }
    return newNode;
  }
  /**
   * Add a point load at a specific position on a beam
   * This will automatically split the beam and create a new node
   * @param beamId - ID of the beam
   * @param position - Position along beam (0 to 1)
   * @param fx - Force in global X direction (N)
   * @param fy - Force in global Y direction (N)
   * @param moment - Moment (Nm)
   * @returns The node where the load is applied, or null if failed
   */
  addPointLoadOnBeam(beamId, position, fx = 0, fy = 0, moment = 0) {
    return this.splitBeamAt(beamId, position, { fx, fy, moment });
  }
  /**
   * Add a sub-node on a beam at parametric position t (0-1).
   * This splits the beam into two new beams and records the sub-node.
   */
  addSubNode(beamId, t) {
    const beam = this.beamElements.get(beamId);
    if (!beam) return null;
    t = Math.max(0.01, Math.min(0.99, t));
    const nodes = this.getBeamElementNodes(beam);
    if (!nodes) return null;
    const [n1, n2] = nodes;
    const newX = n1.x + t * (n2.x - n1.x);
    const newY = n1.y + t * (n2.y - n1.y);
    const newNode = this.addNode(newX, newY);
    const { materialId, section, distributedLoad, profileName, endReleases, startConnection, endConnection } = beam;
    this.beamElements.delete(beamId);
    const beam1 = this.addBeamElement([n1.id, newNode.id], materialId, section, profileName);
    const beam2 = this.addBeamElement([newNode.id, n2.id], materialId, section, profileName);
    if (!beam1 || !beam2) return null;
    if (distributedLoad) {
      this.updateBeamElement(beam1.id, { distributedLoad: { ...distributedLoad } });
      this.updateBeamElement(beam2.id, { distributedLoad: { ...distributedLoad } });
    }
    if (startConnection || endConnection || endReleases) {
      this.updateBeamElement(beam1.id, {
        startConnection: startConnection ?? (endReleases?.startMoment ? "hinge" : void 0),
        endConnection: "fixed",
        endReleases: endReleases ? { startMoment: endReleases.startMoment, endMoment: false } : void 0
      });
      this.updateBeamElement(beam2.id, {
        startConnection: "fixed",
        endConnection: endConnection ?? (endReleases?.endMoment ? "hinge" : void 0),
        endReleases: endReleases ? { startMoment: false, endMoment: endReleases.endMoment } : void 0
      });
    }
    const subNode = {
      id: this.nextSubNodeId++,
      beamId,
      t,
      nodeId: newNode.id,
      originalBeamStart: n1.id,
      originalBeamEnd: n2.id,
      childBeamIds: [beam1.id, beam2.id]
    };
    this.subNodes.set(subNode.id, subNode);
    return subNode;
  }
  /**
   * Remove a sub-node: delete the two child beams and recreate the original beam.
   */
  removeSubNode(subNodeId) {
    const subNode = this.subNodes.get(subNodeId);
    if (!subNode) return false;
    const childBeam1 = this.beamElements.get(subNode.childBeamIds[0]);
    const childBeam2 = this.beamElements.get(subNode.childBeamIds[1]);
    const materialId = childBeam1?.materialId ?? childBeam2?.materialId ?? 1;
    const section = childBeam1?.section ?? childBeam2?.section ?? { A: 538e-5, I: 836e-7, h: 0.3 };
    const profileName = childBeam1?.profileName ?? childBeam2?.profileName;
    const distributedLoad = childBeam1?.distributedLoad ?? childBeam2?.distributedLoad;
    const startConn = childBeam1?.startConnection;
    const endConn = childBeam2?.endConnection;
    const startRelease = childBeam1?.endReleases;
    const endRelease = childBeam2?.endReleases;
    this.beamElements.delete(subNode.childBeamIds[0]);
    this.beamElements.delete(subNode.childBeamIds[1]);
    this.nodes.delete(subNode.nodeId);
    const startNode = this.nodes.get(subNode.originalBeamStart);
    const endNode = this.nodes.get(subNode.originalBeamEnd);
    if (startNode && endNode) {
      const newBeam = this.addBeamElement([startNode.id, endNode.id], materialId, section, profileName);
      if (newBeam) {
        if (distributedLoad) {
          this.updateBeamElement(newBeam.id, { distributedLoad: { ...distributedLoad } });
        }
        const updates = {};
        if (startConn) updates.startConnection = startConn;
        if (endConn) updates.endConnection = endConn;
        if (startRelease || endRelease) {
          updates.endReleases = {
            startMoment: startRelease?.startMoment ?? false,
            endMoment: endRelease?.endMoment ?? false
          };
        }
        if (Object.keys(updates).length > 0) {
          this.updateBeamElement(newBeam.id, updates);
        }
      }
    }
    this.subNodes.delete(subNodeId);
    return true;
  }
  /**
   * Update positions of all sub-nodes on beams connected to a given node.
   * Call this after moving a node that is an endpoint of beams with sub-nodes.
   */
  updateSubNodePositions(movedNodeId) {
    for (const subNode of this.subNodes.values()) {
      if (subNode.originalBeamStart === movedNodeId || subNode.originalBeamEnd === movedNodeId) {
        const startNode = this.nodes.get(subNode.originalBeamStart);
        const endNode = this.nodes.get(subNode.originalBeamEnd);
        const subMeshNode = this.nodes.get(subNode.nodeId);
        if (startNode && endNode && subMeshNode) {
          const newX = startNode.x + subNode.t * (endNode.x - startNode.x);
          const newY = startNode.y + subNode.t * (endNode.y - startNode.y);
          this.updateNode(subNode.nodeId, { x: newX, y: newY });
        }
      }
    }
  }
  /**
   * Get all sub-nodes for a specific original beam ID.
   */
  getSubNodesForBeam(beamId) {
    const result = [];
    for (const subNode of this.subNodes.values()) {
      if (subNode.beamId === beamId) {
        result.push(subNode);
      }
    }
    return result;
  }
  /**
   * Get sub-node by its mesh node ID.
   */
  getSubNodeByNodeId(nodeId) {
    for (const subNode of this.subNodes.values()) {
      if (subNode.nodeId === nodeId) return subNode;
    }
    return void 0;
  }
  /**
   * Check if a node ID belongs to a sub-node.
   */
  isSubNode(nodeId) {
    for (const subNode of this.subNodes.values()) {
      if (subNode.nodeId === nodeId) return true;
    }
    return false;
  }
  addPlateRegion(plate) {
    plate.id = this.nextPlateId++;
    this.plateRegions.set(plate.id, plate);
    return plate;
  }
  removePlateRegion(plateId) {
    this.removeEdgesForPlate(plateId);
    this.removeVerticesForPlate(plateId);
    return this.plateRegions.delete(plateId);
  }
  getPlateRegion(id) {
    return this.plateRegions.get(id);
  }
  getPlateForElement(elemId) {
    for (const plate of this.plateRegions.values()) {
      if (plate.elementIds.includes(elemId)) {
        return plate;
      }
    }
    return void 0;
  }
  // --- Edge CRUD ---
  addEdge(edge) {
    const newEdge = { ...edge, id: this.nextEdgeId++ };
    this.edges.set(newEdge.id, newEdge);
    return newEdge;
  }
  getEdge(id) {
    return this.edges.get(id);
  }
  getEdgesForPlate(plateId) {
    const result = [];
    for (const edge of this.edges.values()) {
      if (edge.plateId === plateId) result.push(edge);
    }
    return result;
  }
  removeEdge(id) {
    return this.edges.delete(id);
  }
  removeEdgesForPlate(plateId) {
    for (const [edgeId, edge] of this.edges) {
      if (edge.plateId === plateId) {
        this.edges.delete(edgeId);
      }
    }
  }
  updateEdgeNodes(edgeId, nodeIds) {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.nodeIds = nodeIds;
    }
  }
  // --- Layer CRUD ---
  addLayer(name, color = "#6b7280") {
    const layer = { id: this.nextLayerId++, name, color, visible: true, locked: false };
    this.layers.set(layer.id, layer);
    return layer;
  }
  getLayer(id) {
    return this.layers.get(id);
  }
  updateLayer(id, updates) {
    const layer = this.layers.get(id);
    if (!layer) return null;
    const updated = { ...layer, ...updates };
    this.layers.set(id, updated);
    return updated;
  }
  removeLayer(id) {
    if (id === 0) return false;
    for (const beam of this.beamElements.values()) {
      if (beam.layerId === id) {
        beam.layerId = 0;
      }
    }
    return this.layers.delete(id);
  }
  isLayerVisible(layerId) {
    const lid = layerId ?? 0;
    const layer = this.layers.get(lid);
    return layer ? layer.visible : true;
  }
  isLayerLocked(layerId) {
    const lid = layerId ?? 0;
    const layer = this.layers.get(lid);
    return layer ? layer.locked : false;
  }
  // ─── Plate Vertex Methods ───────────────────────────────────────────────────
  addPlateVertex(plateId, x, y, index) {
    const vertex = {
      id: this.nextVertexId++,
      plateId,
      x,
      y,
      index
    };
    this.plateVertices.set(vertex.id, vertex);
    return vertex;
  }
  getPlateVertex(id) {
    return this.plateVertices.get(id);
  }
  updatePlateVertex(id, updates) {
    const vertex = this.plateVertices.get(id);
    if (!vertex) return null;
    const updated = { ...vertex, ...updates };
    this.plateVertices.set(id, updated);
    return updated;
  }
  removePlateVertex(id) {
    return this.plateVertices.delete(id);
  }
  getVerticesForPlate(plateId) {
    const vertices = [];
    for (const v of this.plateVertices.values()) {
      if (v.plateId === plateId) vertices.push(v);
    }
    return vertices.sort((a, b) => a.index - b.index);
  }
  removeVerticesForPlate(plateId) {
    for (const [id, v] of this.plateVertices) {
      if (v.plateId === plateId) this.plateVertices.delete(id);
    }
  }
  /**
   * Create vertices for a plate's polygon. Call this when creating a new polygon plate.
   */
  createVerticesForPlate(plateId, polygon) {
    this.removeVerticesForPlate(plateId);
    return polygon.map((p, index) => this.addPlateVertex(plateId, p.x, p.y, index));
  }
  /**
   * Sync plate polygon from vertices. Call after moving vertices.
   */
  syncPlatePolygonFromVertices(plateId) {
    const plate = this.plateRegions.get(plateId);
    if (!plate || !plate.isPolygon) return;
    const vertices = this.getVerticesForPlate(plateId);
    if (vertices.length > 0) {
      plate.polygon = vertices.map((v) => ({ x: v.x, y: v.y }));
    }
  }
  clear() {
    this.nodes.clear();
    this.elements.clear();
    this.beamElements.clear();
    this.plateRegions.clear();
    this.subNodes.clear();
    this.edges.clear();
    this.layers.clear();
    this.plateVertices.clear();
    this.layers.set(0, { id: 0, name: "Default", color: "#3b82f6", visible: true, locked: false });
    this.nextNodeId = 1;
    this.nextElementId = 1;
    this.nextPlateId = 1;
    this.nextSubNodeId = 1;
    this.nextEdgeId = 1;
    this.nextLayerId = 1;
    this.nextVertexId = 1;
  }
  getElementNodes(element) {
    return element.nodeIds.map((id) => this.nodes.get(id)).filter((n) => n !== void 0);
  }
  findNodeAt(x, y, tolerance = 0.1) {
    for (const node of this.nodes.values()) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < tolerance) {
        return node;
      }
    }
    return null;
  }
  getConstrainedDofs() {
    const dofs = [];
    for (const node of this.nodes.values()) {
      const baseIndex = (node.id - 1) * 2;
      if (node.constraints.x) dofs.push(baseIndex);
      if (node.constraints.y) dofs.push(baseIndex + 1);
    }
    return dofs;
  }
  /**
   * Auto-detect beam groups: beams that are collinear and share nodes form a group.
   * Assigns sequential beamGroup IDs to each group of connected collinear beams.
   */
  detectBeamGroups() {
    const beams = Array.from(this.beamElements.values());
    const visited = /* @__PURE__ */ new Set();
    const groups = /* @__PURE__ */ new Map();
    let groupId = 1;
    const getAngle = (b) => {
      const n1 = this.nodes.get(b.nodeIds[0]);
      const n2 = this.nodes.get(b.nodeIds[1]);
      if (!n1 || !n2) return 0;
      return Math.atan2(n2.y - n1.y, n2.x - n1.x);
    };
    const anglesEqual = (a1, a2) => {
      const norm = (a) => {
        let n = a % Math.PI;
        if (n < 0) n += Math.PI;
        return n;
      };
      return Math.abs(norm(a1) - norm(a2)) < 0.01;
    };
    for (const beam of beams) {
      if (visited.has(beam.id)) continue;
      const group = [beam.id];
      visited.add(beam.id);
      const angle = getAngle(beam);
      const queue = [beam];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const nodeId of current.nodeIds) {
          for (const other of beams) {
            if (visited.has(other.id)) continue;
            if (!other.nodeIds.includes(nodeId)) continue;
            if (!anglesEqual(getAngle(other), angle)) continue;
            visited.add(other.id);
            group.push(other.id);
            queue.push(other);
          }
        }
      }
      if (group.length > 1) {
        groups.set(groupId, group);
        for (const bid of group) {
          const b = this.beamElements.get(bid);
          if (b) b.beamGroup = groupId;
        }
        groupId++;
      }
    }
    return groups;
  }
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      elements: Array.from(this.elements.values()),
      beamElements: Array.from(this.beamElements.values()),
      materials: Array.from(this.materials.values()),
      sections: Array.from(this.sections.entries()).map(([name, section]) => ({ name, section })),
      plateRegions: Array.from(this.plateRegions.values()),
      subNodes: Array.from(this.subNodes.values()),
      edges: Array.from(this.edges.values()),
      layers: Array.from(this.layers.values()),
      plateVertices: Array.from(this.plateVertices.values())
    };
  }
  static fromJSON(data) {
    const mesh = new _Mesh();
    mesh.nodes.clear();
    mesh.elements.clear();
    mesh.beamElements.clear();
    mesh.materials.clear();
    mesh.plateRegions.clear();
    mesh.subNodes.clear();
    mesh.edges.clear();
    mesh.plateVertices.clear();
    data.materials.forEach((m) => mesh.materials.set(m.id, m));
    if (data.sections) {
      mesh.sections.clear();
      data.sections.forEach((s) => mesh.sections.set(s.name, s.section));
    }
    data.nodes.forEach((n) => {
      const node = {
        ...n,
        constraints: {
          x: n.constraints.x,
          y: n.constraints.y,
          rotation: n.constraints.rotation ?? false
        },
        loads: {
          fx: n.loads.fx,
          fy: n.loads.fy,
          moment: n.loads.moment ?? 0
        }
      };
      mesh.nodes.set(n.id, node);
    });
    data.elements.forEach((e) => mesh.elements.set(e.id, e));
    if (data.beamElements) {
      data.beamElements.forEach((b) => mesh.beamElements.set(b.id, b));
    }
    if (data.plateRegions) {
      data.plateRegions.forEach((p) => mesh.plateRegions.set(p.id, p));
    }
    if (data.subNodes) {
      data.subNodes.forEach((sn) => mesh.subNodes.set(sn.id, sn));
    }
    if (data.edges) {
      data.edges.forEach((e) => mesh.edges.set(e.id, e));
    }
    if (data.layers && data.layers.length > 0) {
      mesh.layers.clear();
      data.layers.forEach((l) => mesh.layers.set(l.id, l));
    }
    if (data.plateVertices) {
      data.plateVertices.forEach((v) => mesh.plateVertices.set(v.id, v));
    }
    const allElementIds = [
      ...data.elements.map((e) => e.id),
      ...(data.beamElements || []).map((b) => b.id)
    ];
    const allPlateIds = (data.plateRegions || []).map((p) => p.id);
    const allSubNodeIds = (data.subNodes || []).map((sn) => sn.id);
    const allEdgeIds = (data.edges || []).map((e) => e.id);
    const regularNodeIds = data.nodes.filter((n) => n.id < 1e3).map((n) => n.id);
    mesh.nextNodeId = Math.max(...regularNodeIds, 0) + 1;
    mesh.nextElementId = Math.max(...allElementIds, 0) + 1;
    mesh.nextMaterialId = Math.max(...data.materials.map((m) => m.id), 10) + 1;
    mesh.nextPlateId = Math.max(...allPlateIds, 0) + 1;
    mesh.nextSubNodeId = Math.max(...allSubNodeIds, 0) + 1;
    mesh.nextEdgeId = Math.max(...allEdgeIds, 0) + 1;
    const allLayerIds = (data.layers || []).map((l) => l.id);
    mesh.nextLayerId = Math.max(...allLayerIds, 0) + 1;
    const allVertexIds = (data.plateVertices || []).map((v) => v.id);
    mesh.nextVertexId = Math.max(...allVertexIds, 0) + 1;
    const plateNodeIds = data.nodes.filter((n) => n.id >= 1e3).map((n) => n.id);
    mesh.nextPlateNodeId = plateNodeIds.length > 0 ? Math.max(...plateNodeIds) + 1 : 1e3;
    return mesh;
  }
};

// src/core/fem/types.ts
function getBeamDistributedLoads(beam) {
  const out = [];
  if (beam.distributedLoad) out.push(beam.distributedLoad);
  if (beam.distributedLoads) out.push(...beam.distributedLoads);
  return out;
}
var DEFAULT_DOF_CONNECTIONS = { Tx: "fixed", Tz: "fixed", Rz: "fixed" };
function getDOFConnectionTypes(beam) {
  if (beam.startConnections || beam.endConnections) {
    return {
      start: beam.startConnections ?? { ...DEFAULT_DOF_CONNECTIONS },
      end: beam.endConnections ?? { ...DEFAULT_DOF_CONNECTIONS }
    };
  }
  const conn = getConnectionTypes(beam);
  return {
    start: { ...DEFAULT_DOF_CONNECTIONS, Rz: conn.start },
    end: { ...DEFAULT_DOF_CONNECTIONS, Rz: conn.end }
  };
}
function getReleasedLocalDofs(beam) {
  const { start, end } = getDOFConnectionTypes(beam);
  const dofs = [];
  if (start.Tx === "hinge") dofs.push(0);
  if (start.Tz === "hinge") dofs.push(1);
  if (start.Rz === "hinge") dofs.push(2);
  if (end.Tx === "hinge") dofs.push(3);
  if (end.Tz === "hinge") dofs.push(4);
  if (end.Rz === "hinge") dofs.push(5);
  return dofs;
}
function getSprungLocalDofs(beam) {
  const { start, end } = getDOFConnectionTypes(beam);
  const uit = [];
  const zet = (dof, type, k) => {
    if (type === "spring" && k !== void 0 && k > 0) uit.push({ dof, k });
  };
  zet(0, start.Tx, start.springTx);
  zet(1, start.Tz, start.springTz);
  zet(2, start.Rz, start.springRz);
  zet(3, end.Tx, end.springTx);
  zet(4, end.Tz, end.springTz);
  zet(5, end.Rz, end.springRz);
  return uit;
}
function getConnectionTypes(beam) {
  if (beam.startConnections || beam.endConnections) {
    const start = beam.startConnections ?? DEFAULT_DOF_CONNECTIONS;
    const end = beam.endConnections ?? DEFAULT_DOF_CONNECTIONS;
    const pickPrimary = (c) => {
      if (c.Rz !== "fixed") return c.Rz;
      if (c.Tx !== "fixed") return c.Tx;
      if (c.Tz !== "fixed") return c.Tz;
      if (c.Rx && c.Rx !== "fixed") return c.Rx;
      if (c.Ry && c.Ry !== "fixed") return c.Ry;
      if (c.Ty && c.Ty !== "fixed") return c.Ty;
      return "fixed";
    };
    return { start: pickPrimary(start), end: pickPrimary(end) };
  }
  if (beam.startConnection || beam.endConnection) {
    return { start: beam.startConnection ?? "fixed", end: beam.endConnection ?? "fixed" };
  }
  if (beam.endReleases) {
    return {
      start: beam.endReleases.startMoment ? "hinge" : "fixed",
      end: beam.endReleases.endMoment ? "hinge" : "fixed"
    };
  }
  return { start: "fixed", end: "fixed" };
}

// src/core/fem/Triangle.ts
function calculateTriangleArea(n1, n2, n3) {
  const area = 0.5 * Math.abs(
    n1.x * (n2.y - n3.y) + n2.x * (n3.y - n1.y) + n3.x * (n1.y - n2.y)
  );
  return area;
}
function getConstitutiveMatrix(material, type) {
  const E = material.E;
  const nu = material.nu;
  const D = new Matrix(3, 3);
  if (type === "plane_stress") {
    const factor = E / (1 - nu * nu);
    D.set(0, 0, factor);
    D.set(0, 1, factor * nu);
    D.set(1, 0, factor * nu);
    D.set(1, 1, factor);
    D.set(2, 2, factor * (1 - nu) / 2);
  } else {
    const factor = E / ((1 + nu) * (1 - 2 * nu));
    D.set(0, 0, factor * (1 - nu));
    D.set(0, 1, factor * nu);
    D.set(1, 0, factor * nu);
    D.set(1, 1, factor * (1 - nu));
    D.set(2, 2, factor * (1 - 2 * nu) / 2);
  }
  return D;
}
function getStrainDisplacementMatrix(n1, n2, n3) {
  const area = calculateTriangleArea(n1, n2, n3);
  if (area < 1e-12) {
    throw new Error("Triangle has zero or negative area");
  }
  const B = new Matrix(3, 6);
  const beta1 = n2.y - n3.y;
  const beta2 = n3.y - n1.y;
  const beta3 = n1.y - n2.y;
  const gamma1 = n3.x - n2.x;
  const gamma2 = n1.x - n3.x;
  const gamma3 = n2.x - n1.x;
  const factor = 1 / (2 * area);
  B.set(0, 0, factor * beta1);
  B.set(0, 2, factor * beta2);
  B.set(0, 4, factor * beta3);
  B.set(1, 1, factor * gamma1);
  B.set(1, 3, factor * gamma2);
  B.set(1, 5, factor * gamma3);
  B.set(2, 0, factor * gamma1);
  B.set(2, 1, factor * beta1);
  B.set(2, 2, factor * gamma2);
  B.set(2, 3, factor * beta2);
  B.set(2, 4, factor * gamma3);
  B.set(2, 5, factor * beta3);
  return B;
}
function calculateElementStiffness(n1, n2, n3, material, thickness, analysisType) {
  const area = calculateTriangleArea(n1, n2, n3);
  const B = getStrainDisplacementMatrix(n1, n2, n3);
  const D = getConstitutiveMatrix(material, analysisType);
  const Bt = B.transpose();
  const BtD = Bt.multiply(D);
  const BtDB = BtD.multiply(B);
  return BtDB.scale(thickness * area);
}
function calculateElementStress(n1, n2, n3, material, displacements, analysisType) {
  const B = getStrainDisplacementMatrix(n1, n2, n3);
  const D = getConstitutiveMatrix(material, analysisType);
  const DB = D.multiply(B);
  const stress = DB.multiplyVector(displacements);
  const sigmaX = stress[0];
  const sigmaY = stress[1];
  const tauXY = stress[2];
  const vonMises = Math.sqrt(
    sigmaX * sigmaX - sigmaX * sigmaY + sigmaY * sigmaY + 3 * tauXY * tauXY
  );
  return { sigmaX, sigmaY, tauXY, vonMises };
}
function calculatePrincipalStresses(sigmaX, sigmaY, tauXY) {
  const avgStress = (sigmaX + sigmaY) / 2;
  const radius = Math.sqrt(
    Math.pow((sigmaX - sigmaY) / 2, 2) + tauXY * tauXY
  );
  const sigma1 = avgStress + radius;
  const sigma2 = avgStress - radius;
  const angle = 0.5 * Math.atan2(2 * tauXY, sigmaX - sigmaY);
  return { sigma1, sigma2, angle };
}
function calculateTriangleStiffnessExpanded(n1, n2, n3, material, thickness, analysisType) {
  const Ke6 = calculateElementStiffness(n1, n2, n3, material, thickness, analysisType);
  const Ke9 = new Matrix(9, 9);
  const mapping = [0, 1, 3, 4, 6, 7];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      Ke9.set(mapping[i], mapping[j], Ke6.get(i, j));
    }
  }
  return Ke9;
}
function calculateTriangleGeometricStiffness(n1, n2, n3, stress, thickness) {
  const area = calculateTriangleArea(n1, n2, n3);
  if (area < 1e-12) {
    throw new Error("Triangle has zero or negative area");
  }
  const factor = 1 / (2 * area);
  const dNdx = [
    factor * (n2.y - n3.y),
    factor * (n3.y - n1.y),
    factor * (n1.y - n2.y)
  ];
  const dNdy = [
    factor * (n3.x - n2.x),
    factor * (n1.x - n3.x),
    factor * (n2.x - n1.x)
  ];
  const G2 = new Matrix(4, 6);
  for (let i = 0; i < 3; i++) {
    G2.set(0, 2 * i, dNdx[i]);
    G2.set(1, 2 * i, dNdy[i]);
    G2.set(2, 2 * i + 1, dNdx[i]);
    G2.set(3, 2 * i + 1, dNdy[i]);
  }
  return multiplyGtSG(G2, stress, thickness * area, 6);
}
function multiplyGtSG(G2, stress, c, n) {
  const { sigmaX, sigmaY, tauXY } = stress;
  const SG = new Matrix(4, n);
  for (let j = 0; j < n; j++) {
    const gux = G2.get(0, j), guy = G2.get(1, j);
    const gvx = G2.get(2, j), gvy = G2.get(3, j);
    SG.set(0, j, sigmaX * gux + tauXY * guy);
    SG.set(1, j, tauXY * gux + sigmaY * guy);
    SG.set(2, j, sigmaX * gvx + tauXY * gvy);
    SG.set(3, j, tauXY * gvx + sigmaY * gvy);
  }
  const Kg = new Matrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += G2.get(k, i) * SG.get(k, j);
      Kg.set(i, j, c * s);
    }
  }
  return Kg;
}
function membraneGeometricFromGradients(G2, stress, c, n) {
  return multiplyGtSG(G2, stress, c, n);
}
function expandTriangleGeometricStiffness(Kg6) {
  const Kg9 = new Matrix(9, 9);
  const mapping = [0, 1, 3, 4, 6, 7];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      Kg9.set(mapping[i], mapping[j], Kg6.get(i, j));
    }
  }
  return Kg9;
}

// src/core/fem/Quad4.ts
var GP = 1 / Math.sqrt(3);
var GAUSS_POINTS = [
  { xi: -GP, eta: -GP, w: 1 },
  { xi: GP, eta: -GP, w: 1 },
  { xi: GP, eta: GP, w: 1 },
  { xi: -GP, eta: GP, w: 1 }
];
function shapeFunctionDerivatives(xi, eta) {
  const dNdxi = [
    -0.25 * (1 - eta),
    0.25 * (1 - eta),
    0.25 * (1 + eta),
    -0.25 * (1 + eta)
  ];
  const dNdeta = [
    -0.25 * (1 - xi),
    -0.25 * (1 + xi),
    0.25 * (1 + xi),
    0.25 * (1 - xi)
  ];
  return { dNdxi, dNdeta };
}
function jacobian(xi, eta, x, y) {
  const { dNdxi, dNdeta } = shapeFunctionDerivatives(xi, eta);
  let J00 = 0, J01 = 0, J10 = 0, J11 = 0;
  for (let i = 0; i < 4; i++) {
    J00 += dNdxi[i] * x[i];
    J01 += dNdxi[i] * y[i];
    J10 += dNdeta[i] * x[i];
    J11 += dNdeta[i] * y[i];
  }
  const detJ = J00 * J11 - J01 * J10;
  const invJ = [
    [J11 / detJ, -J01 / detJ],
    [-J10 / detJ, J00 / detJ]
  ];
  return { J: [[J00, J01], [J10, J11]], detJ, invJ };
}
function strainDisplacementMatrix(xi, eta, x, y) {
  const { dNdxi, dNdeta } = shapeFunctionDerivatives(xi, eta);
  const { detJ, invJ } = jacobian(xi, eta, x, y);
  const dNdx = [];
  const dNdy = [];
  for (let i = 0; i < 4; i++) {
    dNdx.push(invJ[0][0] * dNdxi[i] + invJ[0][1] * dNdeta[i]);
    dNdy.push(invJ[1][0] * dNdxi[i] + invJ[1][1] * dNdeta[i]);
  }
  const B = new Matrix(3, 8);
  for (let i = 0; i < 4; i++) {
    B.set(0, 2 * i, dNdx[i]);
    B.set(1, 2 * i + 1, dNdy[i]);
    B.set(2, 2 * i, dNdy[i]);
    B.set(2, 2 * i + 1, dNdx[i]);
  }
  return { B, detJ };
}
function calculateQuadStiffness(n1, n2, n3, n4, material, thickness, analysisType) {
  const x = [n1.x, n2.x, n3.x, n4.x];
  const y = [n1.y, n2.y, n3.y, n4.y];
  const D = getConstitutiveMatrix(material, analysisType);
  const Ke = new Matrix(8, 8);
  for (const gp of GAUSS_POINTS) {
    const { B, detJ } = strainDisplacementMatrix(gp.xi, gp.eta, x, y);
    if (detJ <= 0) {
      throw new Error("Quad element has non-positive Jacobian determinant (bad element shape)");
    }
    const Bt = B.transpose();
    const BtD = Bt.multiply(D);
    const BtDB = BtD.multiply(B);
    const factor = gp.w * thickness * detJ;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        Ke.addAt(i, j, factor * BtDB.get(i, j));
      }
    }
  }
  return Ke;
}
function calculateQuadStress(n1, n2, n3, n4, material, displacements, analysisType) {
  const x = [n1.x, n2.x, n3.x, n4.x];
  const y = [n1.y, n2.y, n3.y, n4.y];
  const D = getConstitutiveMatrix(material, analysisType);
  let sigmaX = 0, sigmaY = 0, tauXY = 0;
  for (const gp of GAUSS_POINTS) {
    const { B } = strainDisplacementMatrix(gp.xi, gp.eta, x, y);
    const DB = D.multiply(B);
    const stress = DB.multiplyVector(displacements);
    sigmaX += stress[0];
    sigmaY += stress[1];
    tauXY += stress[2];
  }
  sigmaX /= GAUSS_POINTS.length;
  sigmaY /= GAUSS_POINTS.length;
  tauXY /= GAUSS_POINTS.length;
  const vonMises = Math.sqrt(
    sigmaX * sigmaX - sigmaX * sigmaY + sigmaY * sigmaY + 3 * tauXY * tauXY
  );
  return { sigmaX, sigmaY, tauXY, vonMises };
}
function calculateQuadStiffnessExpanded(n1, n2, n3, n4, material, thickness, analysisType) {
  const Ke8 = calculateQuadStiffness(n1, n2, n3, n4, material, thickness, analysisType);
  const Ke12 = new Matrix(12, 12);
  const mapping = [0, 1, 3, 4, 6, 7, 9, 10];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      Ke12.set(mapping[i], mapping[j], Ke8.get(i, j));
    }
  }
  return Ke12;
}
function calculateQuadGeometricStiffness(n1, n2, n3, n4, stress, thickness) {
  const x = [n1.x, n2.x, n3.x, n4.x];
  const y = [n1.y, n2.y, n3.y, n4.y];
  const Kg = new Matrix(8, 8);
  for (const gp of GAUSS_POINTS) {
    const { dNdxi, dNdeta } = shapeFunctionDerivatives(gp.xi, gp.eta);
    const { detJ, invJ } = jacobian(gp.xi, gp.eta, x, y);
    if (detJ <= 0) {
      throw new Error("Quad element has non-positive Jacobian determinant (bad element shape)");
    }
    const G2 = new Matrix(4, 8);
    for (let i = 0; i < 4; i++) {
      const dNdx = invJ[0][0] * dNdxi[i] + invJ[0][1] * dNdeta[i];
      const dNdy = invJ[1][0] * dNdxi[i] + invJ[1][1] * dNdeta[i];
      G2.set(0, 2 * i, dNdx);
      G2.set(1, 2 * i, dNdy);
      G2.set(2, 2 * i + 1, dNdx);
      G2.set(3, 2 * i + 1, dNdy);
    }
    const bijdrage = membraneGeometricFromGradients(
      G2,
      stress,
      gp.w * thickness * detJ,
      8
    );
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) Kg.addAt(i, j, bijdrage.get(i, j));
    }
  }
  return Kg;
}
function expandQuadGeometricStiffness(Kg8) {
  const Kg12 = new Matrix(12, 12);
  const mapping = [0, 1, 3, 4, 6, 7, 9, 10];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      Kg12.set(mapping[i], mapping[j], Kg8.get(i, j));
    }
  }
  return Kg12;
}

// src/core/fem/DKT.ts
function getBendingConstitutiveMatrix(material, thickness) {
  const E = material.E;
  const nu = material.nu;
  const t = thickness;
  const factor = E * t * t * t / (12 * (1 - nu * nu));
  const Db = new Matrix(3, 3);
  Db.set(0, 0, factor);
  Db.set(0, 1, factor * nu);
  Db.set(1, 0, factor * nu);
  Db.set(1, 1, factor);
  Db.set(2, 2, factor * (1 - nu) / 2);
  return Db;
}
function computeSideParams(xi, yi, xj, yj) {
  const xij = xi - xj;
  const yij = yi - yj;
  const lk2 = xij * xij + yij * yij;
  return {
    a: -xij / lk2,
    b: 0.75 * xij * yij / lk2,
    c: (0.25 * xij * xij - 0.5 * yij * yij) / lk2,
    d: -yij / lk2,
    e: (0.25 * yij * yij - 0.5 * xij * xij) / lk2
  };
}
function computeDKTBMatrix(n1, n2, n3, L1, L2, L3) {
  const x1 = n1.x, y1 = n1.y;
  const x2 = n2.x, y2 = n2.y;
  const x3 = n3.x, y3 = n3.y;
  const s4 = computeSideParams(x1, y1, x2, y2);
  const s5 = computeSideParams(x2, y2, x3, y3);
  const s6 = computeSideParams(x3, y3, x1, y1);
  const dP4_dL1 = 4 * L2;
  const dP4_dL2 = 4 * L1;
  const dP4_dL3 = 0;
  const dP5_dL1 = 0;
  const dP5_dL2 = 4 * L3;
  const dP5_dL3 = 4 * L2;
  const dP6_dL1 = 4 * L3;
  const dP6_dL2 = 0;
  const dP6_dL3 = 4 * L1;
  const dHx_dL1 = [
    1.5 * (s6.a * dP6_dL1 - s4.a * dP4_dL1),
    s6.b * dP6_dL1 + s4.b * dP4_dL1,
    4 * L1 - 1 - s6.c * dP6_dL1 - s4.c * dP4_dL1,
    1.5 * (s4.a * dP4_dL1 - s5.a * dP5_dL1),
    s4.b * dP4_dL1 + s5.b * dP5_dL1,
    -s4.c * dP4_dL1 - s5.c * dP5_dL1,
    1.5 * (s5.a * dP5_dL1 - s6.a * dP6_dL1),
    s5.b * dP5_dL1 + s6.b * dP6_dL1,
    -s5.c * dP5_dL1 - s6.c * dP6_dL1
  ];
  const dHx_dL2 = [
    1.5 * (s6.a * dP6_dL2 - s4.a * dP4_dL2),
    s6.b * dP6_dL2 + s4.b * dP4_dL2,
    -s6.c * dP6_dL2 - s4.c * dP4_dL2,
    1.5 * (s4.a * dP4_dL2 - s5.a * dP5_dL2),
    s4.b * dP4_dL2 + s5.b * dP5_dL2,
    4 * L2 - 1 - s4.c * dP4_dL2 - s5.c * dP5_dL2,
    1.5 * (s5.a * dP5_dL2 - s6.a * dP6_dL2),
    s5.b * dP5_dL2 + s6.b * dP6_dL2,
    -s5.c * dP5_dL2 - s6.c * dP6_dL2
  ];
  const dHx_dL3 = [
    1.5 * (s6.a * dP6_dL3 - s4.a * dP4_dL3),
    s6.b * dP6_dL3 + s4.b * dP4_dL3,
    -s6.c * dP6_dL3 - s4.c * dP4_dL3,
    1.5 * (s4.a * dP4_dL3 - s5.a * dP5_dL3),
    s4.b * dP4_dL3 + s5.b * dP5_dL3,
    -s4.c * dP4_dL3 - s5.c * dP5_dL3,
    1.5 * (s5.a * dP5_dL3 - s6.a * dP6_dL3),
    s5.b * dP5_dL3 + s6.b * dP6_dL3,
    4 * L3 - 1 - s5.c * dP5_dL3 - s6.c * dP6_dL3
  ];
  const dHy_dL1 = [
    1.5 * (s6.d * dP6_dL1 - s4.d * dP4_dL1),
    -(4 * L1 - 1) + s6.e * dP6_dL1 + s4.e * dP4_dL1,
    -s6.b * dP6_dL1 - s4.b * dP4_dL1,
    1.5 * (s4.d * dP4_dL1 - s5.d * dP5_dL1),
    s4.e * dP4_dL1 + s5.e * dP5_dL1,
    -s4.b * dP4_dL1 - s5.b * dP5_dL1,
    1.5 * (s5.d * dP5_dL1 - s6.d * dP6_dL1),
    s5.e * dP5_dL1 + s6.e * dP6_dL1,
    -s5.b * dP5_dL1 - s6.b * dP6_dL1
  ];
  const dHy_dL2 = [
    1.5 * (s6.d * dP6_dL2 - s4.d * dP4_dL2),
    s6.e * dP6_dL2 + s4.e * dP4_dL2,
    -s6.b * dP6_dL2 - s4.b * dP4_dL2,
    1.5 * (s4.d * dP4_dL2 - s5.d * dP5_dL2),
    -(4 * L2 - 1) + s4.e * dP4_dL2 + s5.e * dP5_dL2,
    -s4.b * dP4_dL2 - s5.b * dP5_dL2,
    1.5 * (s5.d * dP5_dL2 - s6.d * dP6_dL2),
    s5.e * dP5_dL2 + s6.e * dP6_dL2,
    -s5.b * dP5_dL2 - s6.b * dP6_dL2
  ];
  const dHy_dL3 = [
    1.5 * (s6.d * dP6_dL3 - s4.d * dP4_dL3),
    s6.e * dP6_dL3 + s4.e * dP4_dL3,
    -s6.b * dP6_dL3 - s4.b * dP4_dL3,
    1.5 * (s4.d * dP4_dL3 - s5.d * dP5_dL3),
    s4.e * dP4_dL3 + s5.e * dP5_dL3,
    -s4.b * dP4_dL3 - s5.b * dP5_dL3,
    1.5 * (s5.d * dP5_dL3 - s6.d * dP6_dL3),
    -(4 * L3 - 1) + s5.e * dP5_dL3 + s6.e * dP6_dL3,
    -s5.b * dP5_dL3 - s6.b * dP6_dL3
  ];
  const area2 = 2 * calculateTriangleArea(n1, n2, n3);
  const y23 = y2 - y3;
  const y31 = y3 - y1;
  const y12 = y1 - y2;
  const x32 = x3 - x2;
  const x13 = x1 - x3;
  const x21 = x2 - x1;
  const invArea2 = 1 / area2;
  const Bb = new Matrix(3, 9);
  for (let j = 0; j < 9; j++) {
    const dHx_dx = invArea2 * (y23 * dHx_dL1[j] + y31 * dHx_dL2[j] + y12 * dHx_dL3[j]);
    const dHx_dy = invArea2 * (x32 * dHx_dL1[j] + x13 * dHx_dL2[j] + x21 * dHx_dL3[j]);
    const dHy_dx = invArea2 * (y23 * dHy_dL1[j] + y31 * dHy_dL2[j] + y12 * dHy_dL3[j]);
    const dHy_dy = invArea2 * (x32 * dHy_dL1[j] + x13 * dHy_dL2[j] + x21 * dHy_dL3[j]);
    Bb.set(0, j, dHx_dx);
    Bb.set(1, j, dHy_dy);
    Bb.set(2, j, dHx_dy + dHy_dx);
  }
  return Bb;
}
var GAUSS_POINTS2 = [
  { L1: 2 / 3, L2: 1 / 6, L3: 1 / 6, w: 1 / 3 },
  { L1: 1 / 6, L2: 2 / 3, L3: 1 / 6, w: 1 / 3 },
  { L1: 1 / 6, L2: 1 / 6, L3: 2 / 3, w: 1 / 3 }
];
function calculateDKTStiffness(n1, n2, n3, material, thickness) {
  const A = calculateTriangleArea(n1, n2, n3);
  if (A < 1e-12) {
    throw new Error("DKT triangle has zero or negative area");
  }
  const Db = getBendingConstitutiveMatrix(material, thickness);
  const Ke = new Matrix(9, 9);
  for (const gp of GAUSS_POINTS2) {
    const Bb = computeDKTBMatrix(n1, n2, n3, gp.L1, gp.L2, gp.L3);
    const BbT = Bb.transpose();
    const BbTDb = BbT.multiply(Db);
    const BbTDbBb = BbTDb.multiply(Bb);
    const scale = A * gp.w;
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        Ke.addAt(i, j, scale * BbTDbBb.get(i, j));
      }
    }
  }
  return Ke;
}
function calculateElementMoments(n1, n2, n3, material, thickness, elemDisp) {
  const Bb = computeDKTBMatrix(n1, n2, n3, 1 / 3, 1 / 3, 1 / 3);
  const Db = getBendingConstitutiveMatrix(material, thickness);
  const kappa = Bb.multiplyVector(elemDisp);
  const m = Db.multiplyVector(kappa);
  return { mx: m[0], my: m[1], mxy: m[2] };
}
function calculateElementShearForces(n1, n2, n3, material, thickness, elemDisp) {
  const Db = getBendingConstitutiveMatrix(material, thickness);
  const gps = GAUSS_POINTS2;
  const mGP = [];
  for (const gp of gps) {
    const Bb = computeDKTBMatrix(n1, n2, n3, gp.L1, gp.L2, gp.L3);
    const kappa = Bb.multiplyVector(elemDisp);
    const m = Db.multiplyVector(kappa);
    const x = gp.L1 * n1.x + gp.L2 * n2.x + gp.L3 * n3.x;
    const y = gp.L1 * n1.y + gp.L2 * n2.y + gp.L3 * n3.y;
    mGP.push({ mx: m[0], my: m[1], mxy: m[2], x, y });
  }
  function fitLinear(vals, coords2) {
    const n = coords2.length;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    let sv = 0, svx = 0, svy = 0;
    for (let i = 0; i < n; i++) {
      const { x, y } = coords2[i];
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      sv += vals[i];
      svx += vals[i] * x;
      svy += vals[i] * y;
    }
    const A = [
      [n, sx, sy],
      [sx, sxx, sxy],
      [sy, sxy, syy]
    ];
    const rhs = [sv, svx, svy];
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (Math.abs(det) < 1e-30) return { a: 0, b: 0, c: 0 };
    const detA = rhs[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (rhs[1] * A[2][2] - A[1][2] * rhs[2]) + A[0][2] * (rhs[1] * A[2][1] - A[1][1] * rhs[2]);
    const detB = A[0][0] * (rhs[1] * A[2][2] - A[1][2] * rhs[2]) - rhs[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * rhs[2] - rhs[1] * A[2][0]);
    const detC = A[0][0] * (A[1][1] * rhs[2] - rhs[1] * A[2][1]) - A[0][1] * (A[1][0] * rhs[2] - rhs[1] * A[2][0]) + rhs[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    return { a: detA / det, b: detB / det, c: detC / det };
  }
  const coords = mGP.map((p) => ({ x: p.x, y: p.y }));
  const mxFit = fitLinear(mGP.map((p) => p.mx), coords);
  const myFit = fitLinear(mGP.map((p) => p.my), coords);
  const mxyFit = fitLinear(mGP.map((p) => p.mxy), coords);
  const vx = mxFit.b + mxyFit.c;
  const vy = mxyFit.b + myFit.c;
  return { vx, vy };
}

// src/core/fem/ThermalLoad.ts
function calculateBeamThermalLocalForces(beam, material) {
  const tl = beam.thermalLoad;
  if (!tl) return [0, 0, 0, 0, 0, 0];
  const alpha = material.alpha ?? 12e-6;
  const E = material.E;
  const A = beam.section.A;
  if (tl.deltaTTop !== void 0 && tl.deltaTBottom !== void 0) {
    const I = beam.section.Iy ?? beam.section.I;
    const h = beam.section.h;
    const deltaTAvg = (tl.deltaTTop + tl.deltaTBottom) / 2;
    const N_th = E * A * alpha * deltaTAvg;
    const M_th = h > 0 ? E * I * alpha * (tl.deltaTTop - tl.deltaTBottom) / h : 0;
    return [-N_th, 0, M_th, N_th, 0, -M_th];
  }
  if (tl.deltaT !== void 0 && tl.deltaT !== 0) {
    const N_th = E * A * alpha * tl.deltaT;
    return [-N_th, 0, 0, N_th, 0, 0];
  }
  return [0, 0, 0, 0, 0, 0];
}

// src/core/solver/Assembler.ts
var PlaatElementFout = class extends Error {
  meshElementId;
  constructor(meshElementId, oorzaak, hoekenM) {
    const hoeken = hoekenM.map((h) => `(${Math.round(h.x * 1e4) / 10}, ${Math.round(h.y * 1e4) / 10})`).join(", ");
    super(
      `schijfelement ${meshElementId} met hoeken ${hoeken} mm is niet op te bouwen (${oorzaak}). Overslaan zou een gat in de stijfheid geven en een krachtsverdeling bij een ander model; de berekening stopt. Wijzig de plaat (bijvoorbeeld de meshSize) zodat het rekenmesh opnieuw wordt gemaakt.`
    );
    this.name = "PlaatElementFout";
    this.meshElementId = meshElementId;
  }
};
function getActiveNodeIds(mesh, analysisType) {
  const activeIds = /* @__PURE__ */ new Set();
  if (analysisType === "frame") {
    for (const beam of mesh.beamElements.values()) {
      for (const nid of beam.nodeIds) activeIds.add(nid);
    }
  } else if (analysisType === "mixed_beam_plate") {
    for (const beam of mesh.beamElements.values()) {
      for (const nid of beam.nodeIds) activeIds.add(nid);
    }
    for (const elem of mesh.elements.values()) {
      for (const nid of elem.nodeIds) activeIds.add(nid);
    }
  } else {
    for (const elem of mesh.elements.values()) {
      for (const nid of elem.nodeIds) activeIds.add(nid);
    }
  }
  return activeIds;
}
function buildNodeIdToIndex(mesh, analysisType) {
  const activeIds = getActiveNodeIds(mesh, analysisType);
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    if (activeIds.has(node.id)) {
      nodeIdToIndex.set(node.id, index);
      index++;
    }
  }
  return nodeIdToIndex;
}
function getDofsPerNode(analysisType) {
  if (analysisType === "frame") return 3;
  if (analysisType === "plate_bending") return 3;
  if (analysisType === "mixed_beam_plate") return 3;
  return 2;
}
function assembleGlobalStiffnessMatrix(mesh, analysisType, axialReleasedBeamIds) {
  const dofsPerNode = getDofsPerNode(analysisType);
  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);
  const numNodes = nodeIdToIndex.size;
  const numDofs = numNodes * dofsPerNode;
  const K = new Matrix(numDofs, numDofs);
  if (analysisType === "frame") {
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;
      const [n1, n2] = nodes;
      try {
        const releasedLocalDofs = getReleasedLocalDofs(beam);
        if (axialReleasedBeamIds?.has(beam.id)) {
          for (const d of [0, 3]) if (!releasedLocalDofs.includes(d)) releasedLocalDofs.push(d);
        }
        const veren = getSprungLocalDofs(beam);
        let Ke;
        if (releasedLocalDofs.length > 0 || veren.length > 0) {
          const L = calculateBeamLength(n1, n2);
          const angle = calculateBeamAngle(n1, n2);
          if (L < 1e-10) throw new Error("Beam element has zero length");
          const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
          if (veren.length > 0) applyEndConnections(Kl, releasedLocalDofs, veren);
          else applyEndReleases(Kl, releasedLocalDofs);
          const T = createTransformationMatrix(angle);
          Ke = T.transpose().multiply(Kl.multiply(T));
        } else {
          Ke = calculateBeamGlobalStiffness(n1, n2, material, beam.section);
        }
        const idx1 = nodeIdToIndex.get(n1.id);
        const idx2 = nodeIdToIndex.get(n2.id);
        const dofIndices = [
          idx1 * 3,
          // u1
          idx1 * 3 + 1,
          // v1
          idx1 * 3 + 2,
          // θ1
          idx2 * 3,
          // u2
          idx2 * 3 + 1,
          // v2
          idx2 * 3 + 2
          // θ2
        ];
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
          }
        }
        if (beam.onGrade?.enabled && beam.onGrade.k > 0) {
          const L = calculateBeamLength(n1, n2);
          const k = beam.onGrade.k;
          const b = beam.onGrade.b ?? 1;
          const kL = k * b * L;
          const v1Dof = dofIndices[1];
          const v2Dof = dofIndices[4];
          K.addAt(v1Dof, v1Dof, kL / 2);
          K.addAt(v2Dof, v2Dof, kL / 2);
          const u1Dof = dofIndices[0];
          const u2Dof = dofIndices[3];
          const kFriction = kL * 1e-3;
          K.addAt(u1Dof, u1Dof, kFriction / 2);
          K.addAt(u2Dof, u2Dof, kFriction / 2);
        }
      } catch (e) {
        console.warn(`Skipping beam element ${beam.id}: ${e}`);
      }
    }
  } else if (analysisType === "plate_bending") {
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      if (nodes.length !== 3) continue;
      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;
      const [n1, n2, n3] = nodes;
      try {
        const Ke = calculateDKTStiffness(n1, n2, n3, material, element.thickness);
        const dofIndices = [];
        for (const node of nodes) {
          const nodeIndex = nodeIdToIndex.get(node.id);
          dofIndices.push(nodeIndex * 3);
          dofIndices.push(nodeIndex * 3 + 1);
          dofIndices.push(nodeIndex * 3 + 2);
        }
        for (let i = 0; i < 9; i++) {
          for (let j = 0; j < 9; j++) {
            K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
          }
        }
      } catch (e) {
        console.warn(`Skipping DKT element ${element.id}: ${e}`);
      }
    }
  } else if (analysisType === "mixed_beam_plate") {
    for (const beam of mesh.beamElements.values()) {
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;
      const [n1, n2] = nodes;
      try {
        const releasedLocalDofs = getReleasedLocalDofs(beam);
        if (axialReleasedBeamIds?.has(beam.id)) {
          for (const d of [0, 3]) if (!releasedLocalDofs.includes(d)) releasedLocalDofs.push(d);
        }
        const veren = getSprungLocalDofs(beam);
        let Ke;
        if (releasedLocalDofs.length > 0 || veren.length > 0) {
          const L = calculateBeamLength(n1, n2);
          const angle = calculateBeamAngle(n1, n2);
          if (L < 1e-10) throw new Error("Beam element has zero length");
          const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
          if (veren.length > 0) applyEndConnections(Kl, releasedLocalDofs, veren);
          else applyEndReleases(Kl, releasedLocalDofs);
          const T = createTransformationMatrix(angle);
          Ke = T.transpose().multiply(Kl.multiply(T));
        } else {
          Ke = calculateBeamGlobalStiffness(n1, n2, material, beam.section);
        }
        const idx1 = nodeIdToIndex.get(n1.id);
        const idx2 = nodeIdToIndex.get(n2.id);
        const dofIndices = [
          idx1 * 3,
          idx1 * 3 + 1,
          idx1 * 3 + 2,
          idx2 * 3,
          idx2 * 3 + 1,
          idx2 * 3 + 2
        ];
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
          }
        }
        if (beam.onGrade?.enabled && beam.onGrade.k > 0) {
          const L = calculateBeamLength(n1, n2);
          const k = beam.onGrade.k;
          const b = beam.onGrade.b ?? 1;
          const kL = k * b * L;
          const v1Dof = dofIndices[1];
          const v2Dof = dofIndices[4];
          K.addAt(v1Dof, v1Dof, kL / 2);
          K.addAt(v2Dof, v2Dof, kL / 2);
          const u1Dof = dofIndices[0];
          const u2Dof = dofIndices[3];
          const kFriction = kL * 1e-3;
          K.addAt(u1Dof, u1Dof, kFriction / 2);
          K.addAt(u2Dof, u2Dof, kFriction / 2);
        }
      } catch (e) {
        console.warn(`Skipping beam element ${beam.id} in mixed analysis: ${e}`);
      }
    }
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;
      try {
        if (nodes.length === 4) {
          const [n1, n2, n3, n4] = nodes;
          const Ke = calculateQuadStiffnessExpanded(n1, n2, n3, n4, material, element.thickness, "plane_stress");
          const dofIndices = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id);
            dofIndices.push(nodeIndex * 3);
            dofIndices.push(nodeIndex * 3 + 1);
            dofIndices.push(nodeIndex * 3 + 2);
          }
          for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        } else if (nodes.length === 3) {
          const [n1, n2, n3] = nodes;
          const Ke = calculateTriangleStiffnessExpanded(n1, n2, n3, material, element.thickness, "plane_stress");
          const dofIndices = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id);
            dofIndices.push(nodeIndex * 3);
            dofIndices.push(nodeIndex * 3 + 1);
            dofIndices.push(nodeIndex * 3 + 2);
          }
          for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        }
      } catch (e) {
        throw new PlaatElementFout(
          element.id,
          e instanceof Error ? e.message : String(e),
          nodes
        );
      }
    }
    const beamNodeIds = /* @__PURE__ */ new Set();
    for (const beam of mesh.beamElements.values()) {
      for (const nid of beam.nodeIds) beamNodeIds.add(nid);
    }
    let maxDiag = 0;
    for (let i = 0; i < numDofs; i++) {
      const d = Math.abs(K.get(i, i));
      if (d > maxDiag) maxDiag = d;
    }
    const rotStab = maxDiag * 1e-6;
    for (const [nodeId, nodeIndex] of nodeIdToIndex.entries()) {
      if (!beamNodeIds.has(nodeId)) {
        const thetaDof = nodeIndex * 3 + 2;
        if (Math.abs(K.get(thetaDof, thetaDof)) < 1e-20) {
          K.addAt(thetaDof, thetaDof, rotStab);
        }
      }
    }
  } else {
    for (const element of mesh.elements.values()) {
      const nodes = mesh.getElementNodes(element);
      const material = mesh.getMaterial(element.materialId);
      if (!material) continue;
      try {
        if (nodes.length === 4) {
          const [n1, n2, n3, n4] = nodes;
          const Ke = calculateQuadStiffness(n1, n2, n3, n4, material, element.thickness, analysisType);
          const dofIndices = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id);
            dofIndices.push(nodeIndex * 2);
            dofIndices.push(nodeIndex * 2 + 1);
          }
          for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        } else if (nodes.length === 3) {
          const [n1, n2, n3] = nodes;
          const Ke = calculateElementStiffness(n1, n2, n3, material, element.thickness, analysisType);
          const dofIndices = [];
          for (const node of nodes) {
            const nodeIndex = nodeIdToIndex.get(node.id);
            dofIndices.push(nodeIndex * 2);
            dofIndices.push(nodeIndex * 2 + 1);
          }
          for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
              K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
            }
          }
        } else {
          continue;
        }
      } catch (e) {
        console.warn(`Skipping element ${element.id}: ${e}`);
      }
    }
  }
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === void 0) continue;
    const c = node.constraints;
    if (analysisType === "plate_bending") {
      if (c.springY != null && c.y) {
        K.addAt(nodeIndex * 3, nodeIndex * 3, c.springY);
      }
      if (c.springRot != null && c.rotation) {
        K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springRot / 2);
        K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot / 2);
      }
    } else if (dofsPerNode === 3) {
      if (c.springX != null && c.x) {
        K.addAt(nodeIndex * 3, nodeIndex * 3, c.springX);
      }
      if (c.springY != null && c.y) {
        K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springY);
      }
      if (c.springRot != null && c.rotation) {
        K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot);
      }
    } else if (dofsPerNode === 2) {
      if (c.springX != null && c.x) {
        K.addAt(nodeIndex * 2, nodeIndex * 2, c.springX);
      }
      if (c.springY != null && c.y) {
        K.addAt(nodeIndex * 2 + 1, nodeIndex * 2 + 1, c.springY);
      }
    }
  }
  return K;
}
function assembleForceVector(mesh, analysisType = "plane_stress") {
  const dofsPerNode = getDofsPerNode(analysisType);
  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);
  const numNodes = nodeIdToIndex.size;
  const numDofs = numNodes * dofsPerNode;
  const F = new Array(numDofs).fill(0);
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === void 0) continue;
    if (analysisType === "plate_bending") {
      F[nodeIndex * 3] = node.loads.fz ?? node.loads.fy;
      F[nodeIndex * 3 + 1] = 0;
      F[nodeIndex * 3 + 2] = 0;
    } else if (dofsPerNode === 3) {
      F[nodeIndex * 3] = node.loads.fx;
      F[nodeIndex * 3 + 1] = node.loads.fy;
      F[nodeIndex * 3 + 2] = node.loads.moment ?? 0;
    } else {
      F[nodeIndex * 2] = node.loads.fx;
      F[nodeIndex * 2 + 1] = node.loads.fy;
    }
  }
  if (analysisType === "frame" || analysisType === "mixed_beam_plate") {
    for (const beam of mesh.beamElements.values()) {
      const material = mesh.getMaterial(beam.materialId);
      const fThermal = material ? calculateBeamThermalLocalForces(beam, material) : [0, 0, 0, 0, 0, 0];
      const hasThermal = fThermal.some((v) => v !== 0);
      const dLoads = getBeamDistributedLoads(beam);
      if (dLoads.length === 0 && !hasThermal) continue;
      const nodes = mesh.getBeamElementNodes(beam);
      if (!nodes) continue;
      const [n1, n2] = nodes;
      const L = calculateBeamLength(n1, n2);
      const angle = calculateBeamAngle(n1, n2);
      const localForces = [0, 0, 0, 0, 0, 0];
      for (const dl of dLoads) {
        const f = calculateDistributedLoadLocalForces(L, angle, dl);
        for (let i = 0; i < 6; i++) localForces[i] += f[i];
      }
      if (hasThermal) {
        for (let i = 0; i < 6; i++) localForces[i] += fThermal[i];
      }
      const releasedLocalDofs = getReleasedLocalDofs(beam);
      const veren = getSprungLocalDofs(beam);
      if (releasedLocalDofs.length > 0 || veren.length > 0) {
        const material2 = mesh.getMaterial(beam.materialId);
        if (material2) {
          const Kl = calculateBeamLocalStiffness(L, material2.E, beam.section.A, beam.section.I);
          if (veren.length > 0) applyEndConnections(Kl, releasedLocalDofs, veren, localForces);
          else applyEndReleases(Kl, releasedLocalDofs, localForces);
        }
      }
      const globalForces = transformLocalToGlobal(localForces, angle);
      const idx1 = nodeIdToIndex.get(n1.id);
      const idx2 = nodeIdToIndex.get(n2.id);
      F[idx1 * 3] += globalForces[0];
      F[idx1 * 3 + 1] += globalForces[1];
      F[idx1 * 3 + 2] += globalForces[2];
      F[idx2 * 3] += globalForces[3];
      F[idx2 * 3 + 1] += globalForces[4];
      F[idx2 * 3 + 2] += globalForces[5];
    }
  }
  return F;
}
function getConstrainedDofs(mesh, analysisType = "plane_stress") {
  const nodeIdToIndex = buildNodeIdToIndex(mesh, analysisType);
  const dofsPerNode = getDofsPerNode(analysisType);
  const dofs = [];
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === void 0) continue;
    if (analysisType === "plate_bending") {
      if (node.constraints.y && node.constraints.springY == null) dofs.push(nodeIndex * 3);
      if (node.constraints.rotation && node.constraints.springRot == null) {
        dofs.push(nodeIndex * 3 + 1);
        dofs.push(nodeIndex * 3 + 2);
      }
    } else if (dofsPerNode === 3) {
      if (node.constraints.x && node.constraints.springX == null) dofs.push(nodeIndex * 3);
      if (node.constraints.y && node.constraints.springY == null) dofs.push(nodeIndex * 3 + 1);
      if (node.constraints.rotation && node.constraints.springRot == null) dofs.push(nodeIndex * 3 + 2);
    } else {
      if (node.constraints.x && node.constraints.springX == null) dofs.push(nodeIndex * 2);
      if (node.constraints.y && node.constraints.springY == null) dofs.push(nodeIndex * 2 + 1);
    }
  }
  return { dofs, nodeIdToIndex };
}
function applyEndReleases(Ke, releasedDofs, F) {
  const n = 6;
  const eliminated = /* @__PURE__ */ new Set();
  for (const c of releasedDofs) {
    const kcc = Ke.get(c, c);
    if (Math.abs(kcc) < 1e-20) {
      for (let i = 0; i < n; i++) {
        Ke.set(i, c, 0);
        Ke.set(c, i, 0);
      }
      if (F) F[c] = 0;
      eliminated.add(c);
      continue;
    }
    const active = [];
    for (let i = 0; i < n; i++) {
      if (i !== c && !eliminated.has(i)) active.push(i);
    }
    const col = active.map((i) => Ke.get(i, c));
    const row = active.map((j) => Ke.get(c, j));
    if (F) {
      const fc = F[c];
      for (let a = 0; a < active.length; a++) {
        F[active[a]] -= col[a] / kcc * fc;
      }
      F[c] = 0;
    }
    for (let a = 0; a < active.length; a++) {
      for (let b = 0; b < active.length; b++) {
        Ke.addAt(active[a], active[b], -col[a] * row[b] / kcc);
      }
    }
    for (let i = 0; i < n; i++) {
      Ke.set(i, c, 0);
      Ke.set(c, i, 0);
    }
    eliminated.add(c);
  }
}
function applyEndConnections(Ke, hingedDofs, springs, F) {
  const n = 6;
  const stappen = [
    ...hingedDofs.map((dof) => ({ dof, k: 0 })),
    ...springs.filter((s) => !hingedDofs.includes(s.dof))
  ];
  for (const { dof: c, k } of stappen) {
    const kcc = Ke.get(c, c) + k;
    if (Math.abs(kcc) < 1e-20) {
      for (let i = 0; i < n; i++) {
        Ke.set(i, c, 0);
        Ke.set(c, i, 0);
      }
      if (F) F[c] = 0;
      continue;
    }
    const kcc0 = Ke.get(c, c);
    const anderen = [];
    for (let i = 0; i < n; i++) if (i !== c) anderen.push(i);
    const col = anderen.map((i) => Ke.get(i, c));
    const row = anderen.map((j) => Ke.get(c, j));
    if (F) {
      const fc = F[c];
      for (let a = 0; a < anderen.length; a++) F[anderen[a]] -= col[a] / kcc * fc;
      F[c] = k * fc / kcc;
    }
    for (let a = 0; a < anderen.length; a++) {
      for (let b = 0; b < anderen.length; b++) {
        Ke.addAt(anderen[a], anderen[b], -col[a] * row[b] / kcc);
      }
    }
    for (let a = 0; a < anderen.length; a++) {
      const v = col[a] * k / kcc;
      Ke.set(anderen[a], c, v);
      Ke.set(c, anderen[a], v);
    }
    Ke.set(c, c, k * kcc0 / kcc);
  }
}

// src/core/fem/BeamForces.ts
var NUM_STATIONS = 21;
function solveKleinStelsel(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((row) => row.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-20) return null;
    if (piv !== col) {
      [A[piv], A[col]] = [A[col], A[piv]];
      [b[piv], b[col]] = [b[col], b[piv]];
    }
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}
function makePartialParticular(L, EI, EA, ld) {
  const a = ld.startT * L;
  const b = ld.endT * L;
  const span = b - a;
  if (span <= 0 || EI <= 0 || EA <= 0) {
    return { wAt: () => 0, uAt: () => 0, dwAt: () => 0 };
  }
  const my = (ld.qyE - ld.qyS) / span;
  const mx = (ld.qxE - ld.qxS) / span;
  const R3 = (x) => {
    if (x <= a) return 0;
    const u1 = x - Math.min(x, b);
    const u2 = x - a;
    const c = ld.qyS + my * (x - a);
    return (c * (u2 ** 4 - u1 ** 4) / 4 - my * (u2 ** 5 - u1 ** 5) / 5) / 6;
  };
  const R2 = (x) => {
    if (x <= a) return 0;
    const u1 = x - Math.min(x, b);
    const u2 = x - a;
    const c = ld.qyS + my * (x - a);
    return (c * (u2 ** 3 - u1 ** 3) / 3 - my * (u2 ** 4 - u1 ** 4) / 4) / 2;
  };
  const V0 = (12 * R3(L) - 6 * L * R2(L)) / L ** 3;
  const M0 = (-R2(L) - V0 * L * L / 2) / L;
  const Rx1 = (x) => {
    if (x <= a) return 0;
    const u1 = x - Math.min(x, b);
    const u2 = x - a;
    const cx = ld.qxS + mx * (x - a);
    return cx * (u2 * u2 - u1 * u1) / 2 - mx * (u2 ** 3 - u1 ** 3) / 3;
  };
  const C1 = Rx1(L) / L;
  return {
    wAt: (x) => (V0 * x ** 3 / 6 + M0 * x * x / 2 + R3(x)) / EI,
    uAt: (x) => (C1 * x - Rx1(x)) / EA,
    dwAt: (x) => (V0 * x * x / 2 + M0 * x + R2(x)) / EI
  };
}
function calculateBeamInternalForces(element, n1, n2, material, globalDisplacements) {
  const L = calculateBeamLength(n1, n2);
  const angle = calculateBeamAngle(n1, n2);
  const localDisp = transformGlobalToLocal(globalDisplacements, angle);
  const dLoads = getBeamDistributedLoads(element).map((dl) => {
    const p = projectDistributedLoadToLocal(dl, angle);
    return { qxS: p.qxS, qyS: p.qyS, qxE: p.qxE, qyE: p.qyE, startT: p.startT, endT: p.endT };
  });
  const Kl = calculateBeamLocalStiffness(L, material.E, element.section.A, element.section.I);
  const equivalentNodalForces = [0, 0, 0, 0, 0, 0];
  for (const dl of dLoads) {
    const isTrap = dl.qxE !== dl.qxS || dl.qyE !== dl.qyS;
    const isPart = dl.startT > 0 || dl.endT < 1;
    let f;
    if (isTrap) {
      f = isPart ? calculatePartialTrapezoidalLoadVector(L, dl.qxS, dl.qyS, dl.qxE, dl.qyE, dl.startT, dl.endT) : calculateTrapezoidalLoadVector(L, dl.qxS, dl.qyS, dl.qxE, dl.qyE);
    } else if (isPart) {
      f = calculatePartialDistributedLoadVector(L, dl.qxS, dl.qyS, dl.startT, dl.endT);
    } else {
      f = calculateDistributedLoadVector(L, dl.qxS, dl.qyS);
    }
    for (let i = 0; i < 6; i++) equivalentNodalForces[i] += f[i];
  }
  const thermalLocal = calculateBeamThermalLocalForces(element, material);
  for (let i = 0; i < 6; i++) {
    equivalentNodalForces[i] += thermalLocal[i];
  }
  const releasedLocalDofs = getReleasedLocalDofs(element);
  const veren = getSprungLocalDofs(element).filter((v) => !releasedLocalDofs.includes(v.dof));
  const dLoc = localDisp.slice();
  const losseDofs = [...releasedLocalDofs, ...veren.map((v) => v.dof)];
  const kVan = (dof) => veren.find((v) => v.dof === dof)?.k ?? 0;
  if (losseDofs.length > 0) {
    const m = losseDofs.length;
    const A = [];
    const b = [];
    for (let r = 0; r < m; r++) {
      const i = losseDofs[r];
      let rhs = equivalentNodalForces[i] + kVan(i) * dLoc[i];
      for (let j = 0; j < 6; j++) {
        if (!losseDofs.includes(j)) rhs -= Kl.get(i, j) * dLoc[j];
      }
      b.push(rhs);
      A.push(losseDofs.map((jj) => Kl.get(i, jj) + (jj === i ? kVan(i) : 0)));
    }
    const sol = solveKleinStelsel(A, b);
    if (sol) {
      for (let r = 0; r < m; r++) dLoc[losseDofs[r]] = sol[r];
    }
  }
  if (veren.length > 0) {
    applyEndConnections(Kl, releasedLocalDofs, veren, equivalentNodalForces);
  } else if (releasedLocalDofs.length > 0) {
    applyEndReleases(Kl, releasedLocalDofs, equivalentNodalForces);
  }
  const localForces = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      localForces[i] += Kl.get(i, j) * localDisp[j];
    }
  }
  for (let i = 0; i < 6; i++) {
    localForces[i] -= equivalentNodalForces[i];
  }
  const N1 = localForces[0];
  const V1 = localForces[1];
  const M1 = -localForces[2];
  const N2 = -localForces[3];
  const V2 = -localForces[4];
  const M2 = localForces[5];
  const stations = [];
  const normalForce = [];
  const shearForce = [];
  const bendingMoment = [];
  for (let i = 0; i < NUM_STATIONS; i++) {
    const x = i / (NUM_STATIONS - 1) * L;
    stations.push(x);
    let intQx = 0;
    let intQy = 0;
    let intQyMoment = 0;
    for (const dl of dLoads) {
      if (x <= dl.startT * L) continue;
      const loadStart = dl.startT * L;
      const loadEnd = Math.min(x, dl.endT * L);
      if (loadEnd <= loadStart) continue;
      const span = (dl.endT - dl.startT) * L;
      const tStart = 0;
      const tEnd = span > 0 ? (loadEnd - loadStart) / span : 0;
      const ds = loadEnd - loadStart;
      intQx += dl.qxS * ds + (dl.qxE - dl.qxS) * ds * (tStart + tEnd) / 2;
      intQy += dl.qyS * ds + (dl.qyE - dl.qyS) * ds * (tStart + tEnd) / 2;
      const nSub = 10;
      const hSub = ds / nSub;
      let sum = 0;
      for (let k = 0; k <= nSub; k++) {
        const s = loadStart + k * hSub;
        const tK = span > 0 ? (s - loadStart) / span : 0;
        const qy_s = dl.qyS + (dl.qyE - dl.qyS) * tK;
        let w;
        if (k === 0 || k === nSub) w = 1;
        else if (k % 2 === 1) w = 4;
        else w = 2;
        sum += w * qy_s * (x - s);
      }
      intQyMoment += sum * hSub / 3;
    }
    const N_x = N1 + intQx;
    normalForce.push(N_x);
    const V_x = V1 + intQy;
    shearForce.push(V_x);
    const M_x = M1 + V1 * x + intQyMoment;
    bendingMoment.push(M_x);
  }
  const EI = material.E * element.section.I;
  const EA = material.E * element.section.A;
  const particulars = dLoads.map((dl) => {
    const isPart = dl.startT > 0 || dl.endT < 1;
    if (!isPart) {
      const hasLoad = dl.qyS !== 0 || dl.qyE !== 0 || dl.qxS !== 0 || dl.qxE !== 0;
      return { kind: hasLoad ? "full" : "none", dl, partial: null };
    }
    return { kind: "partial", dl, partial: makePartialParticular(L, EI, EA, dl) };
  });
  const deflection = [];
  const axialDisp = [];
  const rotation = [];
  const u1L = dLoc[0], v1L = dLoc[1], t1L = dLoc[2];
  const u2L = dLoc[3], v2L = dLoc[4], t2L = dLoc[5];
  for (let i = 0; i < NUM_STATIONS; i++) {
    const x = stations[i];
    const xi = L > 0 ? x / L : 0;
    const H1 = 1 - 3 * xi * xi + 2 * xi * xi * xi;
    const H2 = x * (1 - xi) * (1 - xi);
    const H3 = 3 * xi * xi - 2 * xi * xi * xi;
    const H4 = x * xi * (xi - 1);
    let w = H1 * v1L + H2 * t1L + H3 * v2L + H4 * t2L;
    let u = u1L + (u2L - u1L) * xi;
    const G1 = L > 0 ? 6 * xi * (xi - 1) / L : 0;
    const G2 = 1 - 4 * xi + 3 * xi * xi;
    const G3 = L > 0 ? 6 * xi * (1 - xi) / L : 0;
    const G4 = 3 * xi * xi - 2 * xi;
    let th = G1 * v1L + G2 * t1L + G3 * v2L + G4 * t2L;
    for (const p of particulars) {
      if (p.kind === "full" && EI > 0 && EA > 0) {
        const dl = p.dl;
        const dqy = dl.qyE - dl.qyS;
        const dqx = dl.qxE - dl.qxS;
        w += dl.qyS * x * x * (L - x) * (L - x) / (24 * EI);
        w += dqy * (Math.pow(x, 5) / (120 * L) - L * x * x * x / 40 + L * L * x * x / 60) / EI;
        u += dl.qxS * x * (L - x) / (2 * EA);
        u += dqx * x * (L * L - x * x) / (6 * L * EA);
        th += dl.qyS * x * (L - x) * (L - 2 * x) / (12 * EI);
        th += dqy * (Math.pow(x, 4) / (24 * L) - 3 * L * x * x / 40 + L * L * x / 30) / EI;
      } else if (p.kind === "partial" && p.partial) {
        w += p.partial.wAt(x);
        u += p.partial.uAt(x);
        th += p.partial.dwAt(x);
      }
    }
    deflection.push(w);
    axialDisp.push(u);
    rotation.push(th);
  }
  const maxN = Math.max(...normalForce.map(Math.abs), 1e-10);
  const maxV = Math.max(...shearForce.map(Math.abs), 1e-10);
  const maxM = Math.max(...bendingMoment.map(Math.abs), 1e-10);
  return {
    elementId: element.id,
    N1,
    V1,
    M1,
    N2,
    V2,
    M2,
    stations,
    normalForce,
    shearForce,
    bendingMoment,
    deflection,
    axialDisp,
    rotation,
    maxN,
    maxV,
    maxM
  };
}

// src/core/math/GaussElimination.ts
function solveLinearSystem(A, b) {
  const n = A.rows;
  if (A.rows !== A.cols) {
    throw new Error("Matrix must be square");
  }
  if (b.length !== n) {
    throw new Error("Vector length must match matrix size");
  }
  const aug = new Matrix(n, n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug.set(i, j, A.get(i, j));
    }
    aug.set(i, n, b[i]);
  }
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug.get(col, col));
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug.get(row, col));
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error(`Matrix is singular or nearly singular at column ${col}`);
    }
    if (maxRow !== col) {
      for (let j = col; j <= n; j++) {
        const temp = aug.get(col, j);
        aug.set(col, j, aug.get(maxRow, j));
        aug.set(maxRow, j, temp);
      }
    }
    for (let row = col + 1; row < n; row++) {
      const factor = aug.get(row, col) / aug.get(col, col);
      for (let j = col; j <= n; j++) {
        aug.set(row, j, aug.get(row, j) - factor * aug.get(col, j));
      }
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug.get(i, n);
    for (let j = i + 1; j < n; j++) {
      sum -= aug.get(i, j) * x[j];
    }
    x[i] = sum / aug.get(i, i);
  }
  return x;
}

// src/core/math/SkylineSolver.ts
var ASYMMETRIE_GRENS = 1e-10;
var PIVOT_ABS_DREMPEL = 1e-12;
var PIVOT_REL_DREMPEL = 1e-12;
var laagstePivotRatio = Number.POSITIVE_INFINITY;
var terugvalTeller = 0;
function analyzeMatrix(A) {
  const n = A.rows;
  const first = new Int32Array(n);
  let profileSize = 0;
  let halfBandwidth = 0;
  let maxAsymmetry = 0;
  let maxMagnitude = 0;
  for (let i = 0; i < n; i++) {
    const rij = A.data[i];
    let fi = i;
    for (let j = 0; j < i; j++) {
      const onder = rij[j];
      const boven = A.data[j][i];
      if (onder !== 0 || boven !== 0) {
        if (fi === i) fi = j;
        const verschil = Math.abs(onder - boven);
        if (verschil > maxAsymmetry) maxAsymmetry = verschil;
        const m = Math.abs(onder) > Math.abs(boven) ? Math.abs(onder) : Math.abs(boven);
        if (m > maxMagnitude) maxMagnitude = m;
      }
    }
    const diag = Math.abs(rij[i]);
    if (diag > maxMagnitude) maxMagnitude = diag;
    first[i] = fi;
    profileSize += i - fi + 1;
    if (i - fi > halfBandwidth) halfBandwidth = i - fi;
  }
  return {
    first,
    profileSize,
    halfBandwidth,
    meanHeight: n > 0 ? profileSize / n : 0,
    maxAsymmetry,
    maxMagnitude,
    relAsymmetry: maxMagnitude > 0 ? maxAsymmetry / maxMagnitude : 0
  };
}
function solveSkyline(A, b) {
  const n = A.rows;
  if (A.rows !== A.cols) {
    throw new Error("Matrix must be square");
  }
  if (b.length !== n) {
    throw new Error("Vector length must match matrix size");
  }
  if (n === 0) return [];
  const profiel = analyzeMatrix(A);
  if (profiel.relAsymmetry > ASYMMETRIE_GRENS) {
    terugvalTeller++;
    return solveLinearSystem(A, b);
  }
  return solveWithProfile(A, b, profiel.first);
}
function solveWithProfile(A, b, first) {
  const n = A.rows;
  if (n === 0) return [];
  const start = new Int32Array(n);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    start[i] = offset - first[i];
    offset += i - first[i] + 1;
  }
  const vals = new Float64Array(offset);
  for (let i = 0; i < n; i++) {
    const rij = A.data[i];
    const s = start[i];
    for (let j = first[i]; j <= i; j++) vals[s + j] = rij[j];
  }
  const d = new Float64Array(n);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const fi = first[i];
    const si = start[i];
    for (let j = fi; j < i; j++) {
      const sj = start[j];
      const k0 = fi > first[j] ? fi : first[j];
      let som = vals[si + j];
      for (let k = k0; k < j; k++) som -= t[k] * vals[sj + k];
      vals[si + j] = som / d[j];
      t[j] = som;
    }
    let diag = vals[si + i];
    for (let k = fi; k < i; k++) diag -= vals[si + k] * t[k];
    const oorspronkelijk = Math.abs(A.data[i][i]);
    if (oorspronkelijk > 0) {
      const ratio = Math.abs(diag) / oorspronkelijk;
      if (ratio < laagstePivotRatio) laagstePivotRatio = ratio;
    }
    if (Math.abs(diag) < PIVOT_ABS_DREMPEL || Math.abs(diag) < PIVOT_REL_DREMPEL * oorspronkelijk) {
      throw new Error(`Matrix is singular or nearly singular at column ${i}`);
    }
    d[i] = diag;
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const si = start[i];
    let som = b[i];
    for (let k = first[i]; k < i; k++) som -= vals[si + k] * x[k];
    x[i] = som;
  }
  for (let i = 0; i < n; i++) x[i] /= d[i];
  for (let i = n - 1; i > 0; i--) {
    const si = start[i];
    const xi = x[i];
    if (xi === 0) continue;
    for (let k = first[i]; k < i; k++) x[k] -= vals[si + k] * xi;
  }
  return Array.from(x);
}

// src/core/math/LinearSolver.ts
var LINEAR_SOLVER_IDS = ["gauss", "skyline"];
var STANDAARD = "skyline";
function leesOmgevingskeuze() {
  const g = globalThis;
  const ruw = g.process?.env?.FEM_SOLVER;
  if (!ruw) return STANDAARD;
  const genormaliseerd = ruw.trim().toLowerCase();
  if (LINEAR_SOLVER_IDS.includes(genormaliseerd)) {
    return genormaliseerd;
  }
  return STANDAARD;
}
var actief = leesOmgevingskeuze();
var stats = { calls: 0, totalMs: 0, maxDofs: 0 };
function solveLinearSystem2(A, b) {
  const t0 = performance.now();
  try {
    return actief === "skyline" ? solveSkyline(A, b) : solveLinearSystem(A, b);
  } finally {
    stats.calls++;
    stats.totalMs += performance.now() - t0;
    if (A.rows > stats.maxDofs) stats.maxDofs = A.rows;
  }
}

// src/core/solver/NonlinearMaterial.ts
function createSteelMaterial(fy) {
  const E = 21e10;
  return {
    fy,
    fu: fy * 1.25,
    // Approximate
    E,
    Esh: E / 100,
    epsilonY: fy / E,
    epsilonU: 0.15
  };
}
function steelMomentCurvature(kappa, section, steel) {
  const { h, b, tw, tf } = section;
  const { fy, E, Esh } = steel;
  const nLayers = 20;
  const layers = [];
  const bFlange = b ?? h / 3;
  const tFlange = tf ?? h / 10;
  const tWeb = tw ?? h / 20;
  const hWeb = h - 2 * tFlange;
  const nFlangeL = 4;
  for (let i = 0; i < nFlangeL; i++) {
    const y = h / 2 - tFlange / 2 - (i / (nFlangeL - 1) - 0.5) * tFlange;
    layers.push({ y, A: bFlange * tFlange / nFlangeL });
  }
  const nWebL = nLayers - 2 * nFlangeL;
  for (let i = 0; i < nWebL; i++) {
    const y = hWeb / 2 * (1 - 2 * i / (nWebL - 1));
    layers.push({ y, A: tWeb * hWeb / nWebL });
  }
  for (let i = 0; i < nFlangeL; i++) {
    const y = -h / 2 + tFlange / 2 + (i / (nFlangeL - 1) - 0.5) * tFlange;
    layers.push({ y, A: bFlange * tFlange / nFlangeL });
  }
  let M = 0;
  let EI_tangent = 0;
  for (const layer of layers) {
    const epsilon = kappa * layer.y;
    const epsilonY = fy / E;
    let sigma;
    let Et;
    if (Math.abs(epsilon) <= epsilonY) {
      sigma = E * epsilon;
      Et = E;
    } else {
      const sign = epsilon > 0 ? 1 : -1;
      const epsilonPlastic = Math.abs(epsilon) - epsilonY;
      sigma = sign * (fy + Esh * epsilonPlastic);
      Et = Esh;
    }
    M += sigma * layer.A * layer.y;
    EI_tangent += Et * layer.A * layer.y * layer.y;
  }
  return { M, EI_tangent };
}
function steelSectionCapacity(section, steel) {
  const Wy = section.Wy ?? section.I / (section.h / 2);
  const Wpl = section.Wply ?? Wy * 1.15;
  const My = Wy * steel.fy;
  const Mp = Wpl * steel.fy;
  return { My, Mp };
}
function createConcreteMaterial(fck) {
  const fcd = fck / 1.5;
  const fctm = 0.3 * Math.pow(fck / 1e6, 2 / 3) * 1e6;
  const Ecm = 22e3 * Math.pow(fck / 1e6 / 10, 0.3) * 1e6;
  return {
    fck,
    fcd,
    fctm,
    Ecm,
    epsilonC2: 2e-3,
    epsilonCU2: 35e-4
  };
}
function concreteStress(epsilon, concrete) {
  const { fcd, epsilonC2, epsilonCU2 } = concrete;
  if (epsilon >= 0) {
    return { sigma: 0, Et: 0 };
  }
  const epsC = -epsilon;
  if (epsC <= epsilonC2) {
    const n = 2;
    const ratio = epsC / epsilonC2;
    const sigma = -fcd * (1 - Math.pow(1 - ratio, n));
    const Et = fcd * n * Math.pow(1 - ratio, n - 1) / epsilonC2;
    return { sigma, Et };
  } else if (epsC <= epsilonCU2) {
    return { sigma: -fcd, Et: 0 };
  } else {
    return { sigma: 0, Et: 0 };
  }
}
function rebarStress(epsilon, rebar) {
  const epsilonY = rebar.fy / rebar.Es;
  if (Math.abs(epsilon) <= epsilonY) {
    return { sigma: rebar.Es * epsilon, Et: rebar.Es };
  } else {
    const sign = epsilon > 0 ? 1 : -1;
    return { sigma: sign * rebar.fy, Et: 0 };
  }
}
function concreteMomentCurvature(kappa, b, h, concrete, rebarTop, rebarBot, neutralAxisGuess) {
  const nLayers = 20;
  const layerH = h / nLayers;
  let xNA = neutralAxisGuess ?? h / 2;
  for (let iter = 0; iter < 20; iter++) {
    let N = 0;
    let dN_dxNA = 0;
    for (let i = 0; i < nLayers; i++) {
      const yFromTop = (i + 0.5) * layerH;
      const yFromNA = xNA - yFromTop;
      const epsilon = kappa * yFromNA;
      const { sigma, Et } = concreteStress(epsilon, concrete);
      const dA = b * layerH;
      N += sigma * dA;
      dN_dxNA += Et * kappa * dA;
    }
    {
      const yFromNA = xNA - rebarTop.d;
      const epsilon = kappa * yFromNA;
      const { sigma, Et } = rebarStress(epsilon, rebarTop);
      N += sigma * rebarTop.As;
      dN_dxNA += Et * kappa * rebarTop.As;
    }
    {
      const yFromNA = xNA - rebarBot.d;
      const epsilon = kappa * yFromNA;
      const { sigma, Et } = rebarStress(epsilon, rebarBot);
      N += sigma * rebarBot.As;
      dN_dxNA += Et * kappa * rebarBot.As;
    }
    if (Math.abs(dN_dxNA) < 1e-20) break;
    const delta = -N / dN_dxNA;
    xNA += delta;
    xNA = Math.max(0.01 * h, Math.min(0.99 * h, xNA));
    if (Math.abs(N) < 1 && Math.abs(delta) < 1e-6) break;
  }
  let M = 0;
  let EI_tangent = 0;
  const yRef = h / 2;
  for (let i = 0; i < nLayers; i++) {
    const yFromTop = (i + 0.5) * layerH;
    const yFromNA = xNA - yFromTop;
    const epsilon = kappa * yFromNA;
    const { sigma, Et } = concreteStress(epsilon, concrete);
    const dA = b * layerH;
    const lever = yRef - yFromTop;
    M += sigma * dA * lever;
    EI_tangent += Et * dA * yFromNA * yFromNA;
  }
  {
    const yFromNA = xNA - rebarTop.d;
    const epsilon = kappa * yFromNA;
    const { sigma, Et } = rebarStress(epsilon, rebarTop);
    const lever = yRef - rebarTop.d;
    M += sigma * rebarTop.As * lever;
    EI_tangent += Et * rebarTop.As * yFromNA * yFromNA;
  }
  {
    const yFromNA = xNA - rebarBot.d;
    const epsilon = kappa * yFromNA;
    const { sigma, Et } = rebarStress(epsilon, rebarBot);
    const lever = yRef - rebarBot.d;
    M += sigma * rebarBot.As * lever;
    EI_tangent += Et * rebarBot.As * yFromNA * yFromNA;
  }
  return { M, EI_tangent, xNA };
}
function concreteSectionCapacity(b, _h, concrete, rebarBot) {
  const d = rebarBot.d;
  const As = rebarBot.As;
  const fyd = rebarBot.fy;
  const fcd = concrete.fcd;
  const z = 0.9 * d;
  const My = As * fyd * z;
  const x = As * fyd / (0.8 * b * fcd);
  const zU = d - 0.4 * x;
  const Mu = As * fyd * zU;
  return { My, Mu };
}
function initSectionState(section, materialType, steel, concrete, rebarBot) {
  let My = 0;
  let Mp = 0;
  if (materialType === "steel" && steel) {
    const cap = steelSectionCapacity(section, steel);
    My = cap.My;
    Mp = cap.Mp;
  } else if (materialType === "concrete" && concrete && rebarBot) {
    const cap = concreteSectionCapacity(section.b ?? 0.3, section.h, concrete, rebarBot);
    My = cap.My;
    Mp = cap.Mu;
  }
  return {
    curvature: 0,
    moment: 0,
    tangentStiffness: section.I * (steel?.E ?? concrete?.Ecm ?? 21e10),
    isYielded: false,
    plasticRotation: 0,
    yieldMoment: My,
    plasticMoment: Mp,
    maxCurvature: 0
  };
}
function updateSectionState(state, kappa, section, materialType, steel, concrete, rebarTop, rebarBot) {
  let M;
  let EI_tangent;
  if (materialType === "steel" && steel) {
    const result = steelMomentCurvature(kappa, section, steel);
    M = result.M;
    EI_tangent = result.EI_tangent;
  } else if (materialType === "concrete" && concrete && rebarTop && rebarBot) {
    const result = concreteMomentCurvature(
      kappa,
      section.b ?? 0.3,
      section.h,
      concrete,
      rebarTop,
      rebarBot
    );
    M = result.M;
    EI_tangent = result.EI_tangent;
  } else {
    const E = steel?.E ?? concrete?.Ecm ?? 21e10;
    M = E * section.I * kappa;
    EI_tangent = E * section.I;
  }
  const isYielded = Math.abs(M) >= state.yieldMoment;
  const maxCurvature = Math.max(state.maxCurvature, Math.abs(kappa));
  return {
    ...state,
    curvature: kappa,
    moment: M,
    tangentStiffness: EI_tangent,
    isYielded,
    maxCurvature
  };
}

// src/core/solver/NonlinearSolver.ts
function mmTekst(v) {
  return (Math.round(v * 10) / 10).toString().replace(".", ",");
}
var SingulierStelselFout = class extends Error {
  meshKnoopId;
  xMm;
  zMm;
  richting;
  losseKnoop;
  origineel;
  constructor(v) {
    super("");
    this.name = "SingulierStelselFout";
    this.meshKnoopId = v.meshKnoopId;
    this.xMm = v.xMm;
    this.zMm = v.zMm;
    this.richting = v.richting;
    this.losseKnoop = v.losseKnoop;
    this.origineel = v.origineel;
    this.message = this.tekstVoor("een rekenknoop");
  }
  /** De melding met `knoop` als onderwerp, bijvoorbeeld "knoop 7". */
  tekstVoor(knoop) {
    const beweging = this.richting === "x" ? "horizontaal verschuiven (x)" : this.richting === "z" ? "verticaal verschuiven (z)" : "draaien";
    const oorzaak = this.losseKnoop ? "Deze knoop is met geen enkele staaf verbonden (een losse knoop): verwijder hem, of verbind hem met de constructie." : this.richting === "rotatie" ? "Niets houdt die rotatie tegen: waarschijnlijk hebben alle staafeinden op deze knoop een scharnier (release Ry) terwijl de knoop zelf geen rotatiesteun heeft. Laat \xE9\xE9n staaf star aansluiten, of haal het scharnier weg op een scharnieroplegging." : "Niets houdt die verplaatsing tegen: controleer de opleggingen, of de staven daar werkelijk aan elkaar vastzitten, en of een normaalkracht- of dwarskrachthuls (release Tx/Tz) niet de enige verbinding is.";
    return `Het stelsel is singulier: ${knoop} op (${mmTekst(this.xMm)}, ${mmTekst(this.zMm)}) mm kan vrij ${beweging}. ${oorzaak} (Oorspronkelijke melding: ${this.origineel})`;
  }
};
function vertaalSingulier(e, mesh, knoopVanIndex) {
  const origineel = e instanceof Error ? e.message : String(e);
  const treffer = /column (\d+)/.exec(origineel);
  if (!treffer) return e;
  const kolom = Number(treffer[1]);
  const index = Math.floor(kolom / 3);
  const knoopId = knoopVanIndex ? knoopVanIndex(index)?.id : [...mesh.nodes.values()][index]?.id;
  const knoop = knoopId === void 0 ? void 0 : mesh.nodes.get(knoopId);
  if (!knoop) return e;
  let losseKnoop = true;
  for (const beam of mesh.beamElements.values()) {
    const eind = mesh.getBeamElementNodes(beam);
    if (eind && (eind[0].id === knoop.id || eind[1].id === knoop.id)) {
      losseKnoop = false;
      break;
    }
  }
  if (losseKnoop) {
    for (const element of mesh.elements.values()) {
      if (element.nodeIds.includes(knoop.id)) {
        losseKnoop = false;
        break;
      }
    }
  }
  const richtingen = ["x", "z", "rotatie"];
  return new SingulierStelselFout({
    meshKnoopId: knoop.id,
    xMm: knoop.x * 1e3,
    zMm: knoop.y * 1e3,
    richting: richtingen[kolom % 3],
    losseKnoop,
    origineel
  });
}
function losFrameStelselOp(K, F, mesh) {
  try {
    return solveLinearSystem2(K, F);
  } catch (e) {
    throw vertaalSingulier(e, mesh);
  }
}
function nulElementFout(elementId, knoop) {
  return new Error(
    `Rekenelement ${elementId} heeft lengte nul: begin- en eindknoop liggen allebei op (${mmTekst(knoop.x * 1e3)}, ${mmTekst(knoop.y * 1e3)}) mm. Zo'n element kan geen kracht overbrengen, en overslaan zou een krachtsverdeling geven bij een ander model dan is ingevoerd. Voeg de twee knopen samen of verwijder de staaf.`
  );
}
function heeftElementlasten(mesh) {
  for (const beam of mesh.beamElements.values()) {
    const verdeeld = getBeamDistributedLoads(beam);
    if (verdeeld.some((dl) => dl.qx !== 0 || dl.qy !== 0 || (dl.qxEnd ?? 0) !== 0 || (dl.qyEnd ?? 0) !== 0)) {
      return true;
    }
    const material = mesh.getMaterial(beam.materialId);
    if (material && calculateBeamThermalLocalForces(beam, material).some((v) => v !== 0)) return true;
  }
  return false;
}
var DEFAULT_OPTIONS = {
  analysisType: "frame",
  geometricNonlinear: false,
  materialNonlinear: false,
  materialType: "steel",
  steelFy: 235e6,
  // S235
  concreteFck: 3e7,
  // C30/37
  maxIterations: 20,
  tolerance: 1e-6,
  loadSteps: 1
};
function calculateGeometricStiffness(L, N) {
  const Kg = new Matrix(6, 6);
  const factor = N / L;
  const a = 6 / 5;
  const b = L / 10;
  const c = 2 * L * L / 15;
  const d = -L / 10;
  const e = -L * L / 30;
  Kg.set(1, 1, a * factor);
  Kg.set(1, 2, b * factor);
  Kg.set(2, 1, b * factor);
  Kg.set(1, 4, -a * factor);
  Kg.set(4, 1, -a * factor);
  Kg.set(1, 5, b * factor);
  Kg.set(5, 1, b * factor);
  Kg.set(2, 2, c * factor);
  Kg.set(2, 4, d * factor);
  Kg.set(4, 2, d * factor);
  Kg.set(2, 5, e * factor);
  Kg.set(5, 2, e * factor);
  Kg.set(4, 4, a * factor);
  Kg.set(4, 5, d * factor);
  Kg.set(5, 4, d * factor);
  Kg.set(5, 5, c * factor);
  return Kg;
}
function telGeometrischeStijfheidOp(Kl, L, N) {
  const Kg = calculateGeometricStiffness(L, N);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      Kl.addAt(i, j, Kg.get(i, j));
    }
  }
}
function assembleGlobalStiffnessWithGeometric(mesh, axialForces, includeGeometric) {
  const numNodes = mesh.getNodeCount();
  const numDofs = numNodes * 3;
  const K = new Matrix(numDofs, numDofs);
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;
    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);
    if (L < 1e-10) throw nulElementFout(beam.id, n1);
    const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
    if (includeGeometric) {
      const N = -(axialForces.get(beam.id) || 0);
      telGeometrischeStijfheidOp(Kl, L, N);
    }
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    if (veren.length > 0) {
      applyEndConnections(Kl, releasedLocalDofs, veren);
    } else if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }
    const T = createTransformationMatrix(angle);
    const TT = T.transpose();
    const temp = Kl.multiply(T);
    const Ke = TT.multiply(temp);
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    const dofIndices = [
      idx1 * 3,
      idx1 * 3 + 1,
      idx1 * 3 + 2,
      idx2 * 3,
      idx2 * 3 + 1,
      idx2 * 3 + 2
    ];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
      }
    }
    if (beam.onGrade?.enabled && beam.onGrade.k > 0) {
      const k = beam.onGrade.k;
      const b = beam.onGrade.b ?? 1;
      const kL = k * b * L;
      const v1Dof = dofIndices[1];
      const v2Dof = dofIndices[4];
      K.addAt(v1Dof, v1Dof, kL / 2);
      K.addAt(v2Dof, v2Dof, kL / 2);
      const u1Dof = dofIndices[0];
      const u2Dof = dofIndices[3];
      const kFriction = kL * 1e-3;
      K.addAt(u1Dof, u1Dof, kFriction / 2);
      K.addAt(u2Dof, u2Dof, kFriction / 2);
    }
  }
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === void 0) continue;
    const c = node.constraints;
    if (c.springX != null && c.x) {
      K.addAt(nodeIndex * 3, nodeIndex * 3, c.springX);
    }
    if (c.springY != null && c.y) {
      K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springY);
    }
    if (c.springRot != null && c.rotation) {
      K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot);
    }
  }
  return K;
}
function calculateBeamLocalStiffnessFNL(L, E, A, _I, EI_tangent) {
  const Kl = new Matrix(6, 6);
  const EA_L = E * A / L;
  Kl.set(0, 0, EA_L);
  Kl.set(0, 3, -EA_L);
  Kl.set(3, 0, -EA_L);
  Kl.set(3, 3, EA_L);
  const EI = EI_tangent;
  const EI_L3 = EI / (L * L * L);
  const EI_L2 = EI / (L * L);
  const EI_L = EI / L;
  Kl.set(1, 1, 12 * EI_L3);
  Kl.set(1, 2, 6 * EI_L2);
  Kl.set(2, 1, 6 * EI_L2);
  Kl.set(1, 4, -12 * EI_L3);
  Kl.set(4, 1, -12 * EI_L3);
  Kl.set(1, 5, 6 * EI_L2);
  Kl.set(5, 1, 6 * EI_L2);
  Kl.set(2, 2, 4 * EI_L);
  Kl.set(2, 4, -6 * EI_L2);
  Kl.set(4, 2, -6 * EI_L2);
  Kl.set(2, 5, 2 * EI_L);
  Kl.set(5, 2, 2 * EI_L);
  Kl.set(4, 4, 12 * EI_L3);
  Kl.set(4, 5, -6 * EI_L2);
  Kl.set(5, 4, -6 * EI_L2);
  Kl.set(5, 5, 4 * EI_L);
  return Kl;
}
function assembleGlobalStiffnessFNL(mesh, sectionStates, axialForces, includeGeometric) {
  const numNodes = mesh.getNodeCount();
  const numDofs = numNodes * 3;
  const K = new Matrix(numDofs, numDofs);
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;
    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);
    if (L < 1e-10) throw nulElementFout(beam.id, n1);
    const sectionState = sectionStates.get(beam.id);
    const EI_eff = sectionState?.tangentStiffness ?? material.E * beam.section.I;
    const Kl = calculateBeamLocalStiffnessFNL(L, material.E, beam.section.A, beam.section.I, EI_eff);
    if (includeGeometric) {
      const N = -(axialForces.get(beam.id) || 0);
      telGeometrischeStijfheidOp(Kl, L, N);
    }
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    if (veren.length > 0) {
      applyEndConnections(Kl, releasedLocalDofs, veren);
    } else if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }
    const T = createTransformationMatrix(angle);
    const TT = T.transpose();
    const temp = Kl.multiply(T);
    const Ke = TT.multiply(temp);
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    const dofIndices = [
      idx1 * 3,
      idx1 * 3 + 1,
      idx1 * 3 + 2,
      idx2 * 3,
      idx2 * 3 + 1,
      idx2 * 3 + 2
    ];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K.addAt(dofIndices[i], dofIndices[j], Ke.get(i, j));
      }
    }
  }
  for (const node of mesh.nodes.values()) {
    const nodeIndex = nodeIdToIndex.get(node.id);
    if (nodeIndex === void 0) continue;
    const c = node.constraints;
    if (c.springX != null && c.x) {
      K.addAt(nodeIndex * 3, nodeIndex * 3, c.springX);
    }
    if (c.springY != null && c.y) {
      K.addAt(nodeIndex * 3 + 1, nodeIndex * 3 + 1, c.springY);
    }
    if (c.springRot != null && c.rotation) {
      K.addAt(nodeIndex * 3 + 2, nodeIndex * 3 + 2, c.springRot);
    }
  }
  return K;
}
function updateAllSectionStates(mesh, displacements, sectionStates, opts) {
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }
  const steel = opts.materialType === "steel" ? createSteelMaterial(opts.steelFy) : void 0;
  const concrete = opts.materialType === "concrete" ? createConcreteMaterial(opts.concreteFck) : void 0;
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;
    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);
    if (L < 1e-10) continue;
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const u1 = displacements[idx1 * 3];
    const v1 = displacements[idx1 * 3 + 1];
    const theta1 = displacements[idx1 * 3 + 2];
    const u2 = displacements[idx2 * 3];
    const v2 = displacements[idx2 * 3 + 1];
    const theta2 = displacements[idx2 * 3 + 2];
    const vL1 = -u1 * sin + v1 * cos;
    const vL2 = -u2 * sin + v2 * cos;
    const kappa = (theta2 - theta1) / L + 6 * (vL2 - vL1) / (L * L);
    let state = sectionStates.get(beam.id);
    if (!state) {
      state = initSectionState(beam.section, opts.materialType, steel, concrete);
    }
    state = updateSectionState(
      state,
      kappa,
      beam.section,
      opts.materialType,
      steel,
      concrete,
      void 0,
      // rebarTop
      void 0
      // rebarBot
    );
    sectionStates.set(beam.id, state);
  }
  return sectionStates;
}
function assembleForceVector2(mesh) {
  const numNodes = mesh.getNodeCount();
  const F = new Array(numNodes * 3).fill(0);
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }
  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id);
    F[idx * 3] = node.loads.fx;
    F[idx * 3 + 1] = node.loads.fy;
    F[idx * 3 + 2] = node.loads.moment || 0;
  }
  for (const beam of mesh.beamElements.values()) {
    const material = mesh.getMaterial(beam.materialId);
    const fThermal = material ? calculateBeamThermalLocalForces(beam, material) : [0, 0, 0, 0, 0, 0];
    const hasThermal = fThermal.some((v) => v !== 0);
    const dLoads = getBeamDistributedLoads(beam);
    if (dLoads.length === 0 && !hasThermal) continue;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);
    const fLocal = [0, 0, 0, 0, 0, 0];
    for (const dl of dLoads) {
      const f = calculateDistributedLoadLocalForces(L, angle, dl);
      for (let i = 0; i < 6; i++) fLocal[i] += f[i];
    }
    if (hasThermal) {
      for (let i = 0; i < 6; i++) fLocal[i] += fThermal[i];
    }
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    if ((releasedLocalDofs.length > 0 || veren.length > 0) && material) {
      const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
      if (veren.length > 0) applyEndConnections(Kl, releasedLocalDofs, veren, fLocal);
      else applyEndReleases(Kl, releasedLocalDofs, fLocal);
    }
    const T = createTransformationMatrix(angle);
    const TT = T.transpose();
    const fGlobal = new Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        fGlobal[i] += TT.get(i, j) * fLocal[j];
      }
    }
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    F[idx1 * 3] += fGlobal[0];
    F[idx1 * 3 + 1] += fGlobal[1];
    F[idx1 * 3 + 2] += fGlobal[2];
    F[idx2 * 3] += fGlobal[3];
    F[idx2 * 3 + 1] += fGlobal[4];
    F[idx2 * 3 + 2] += fGlobal[5];
  }
  return F;
}
function applyBoundaryConditions(K, F, mesh) {
  const Kmod = K.clone();
  const Fmod = [...F];
  const fixedDofs = [];
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }
  const penalty = 1e20;
  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id);
    const c = node.constraints;
    if (c.x && c.springX == null) {
      const dof = idx * 3;
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
      fixedDofs.push(dof);
    }
    if (c.y && c.springY == null) {
      const dof = idx * 3 + 1;
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
      fixedDofs.push(dof);
    }
    if (c.rotation && c.springRot == null) {
      const dof = idx * 3 + 2;
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
      fixedDofs.push(dof);
    }
  }
  return { K: Kmod, F: Fmod, fixedDofs };
}
function calculateAllInternalForces(mesh, displacements) {
  const beamForces = /* @__PURE__ */ new Map();
  const axialForces = /* @__PURE__ */ new Map();
  const nodeIdToIndex = /* @__PURE__ */ new Map();
  let index = 0;
  for (const node of mesh.nodes.values()) {
    nodeIdToIndex.set(node.id, index);
    index++;
  }
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;
    const [n1, n2] = nodes;
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    const globalDisp = [
      displacements[idx1 * 3],
      displacements[idx1 * 3 + 1],
      displacements[idx1 * 3 + 2],
      displacements[idx2 * 3],
      displacements[idx2 * 3 + 1],
      displacements[idx2 * 3 + 2]
    ];
    const forces = calculateBeamInternalForces(beam, n1, n2, material, globalDisp);
    beamForces.set(beam.id, forces);
    axialForces.set(beam.id, (forces.N1 + forces.N2) / 2);
  }
  return { beamForces, axialForces };
}
function countNonPositivePivots(K) {
  const n = K.rows;
  const a = [];
  const diag0 = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(K.get(i, j));
    a.push(row);
    diag0.push(Math.abs(K.get(i, i)) || 1);
  }
  let nonPositive = 0;
  for (let col = 0; col < n; col++) {
    const piv = a[col][col];
    if (!Number.isFinite(piv) || Math.abs(piv) < 1e-10 * diag0[col]) {
      return nonPositive + 1;
    }
    if (piv < 0) nonPositive++;
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / piv;
      if (factor === 0) continue;
      for (let j = col; j < n; j++) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }
  return nonPositive;
}
function solveNonlinear(mesh, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (opts.analysisType === "mixed_beam_plate") {
    return solveMixed(mesh, opts);
  }
  if (opts.analysisType === "plate_bending" || opts.analysisType === "plane_stress" || opts.analysisType === "plane_strain") {
    if (mesh.elements.size > 0) {
      return solvePlateOrPlane(mesh, opts);
    }
    if (mesh.getBeamCount() > 0) {
      opts.analysisType = "frame";
    } else {
      throw new Error("Model must have plate elements for this analysis type, or beams for frame analysis");
    }
  }
  if (mesh.getNodeCount() < 2) {
    throw new Error("Model must have at least 2 nodes");
  }
  if (mesh.getBeamCount() < 1) {
    throw new Error("Model must have at least 1 beam element");
  }
  let hasConstraints = false;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      hasConstraints = true;
      break;
    }
  }
  if (!hasConstraints) {
    throw new Error("Model has no constraints - add boundary conditions");
  }
  const F = assembleForceVector2(mesh);
  const hasLoads = F.some((f) => f !== 0) || heeftElementlasten(mesh);
  if (!hasLoads) {
    throw new Error("No loads applied - add forces to nodes");
  }
  const numDofs = mesh.getNodeCount() * 3;
  let displacements = new Array(numDofs).fill(0);
  let axialForces = /* @__PURE__ */ new Map();
  const log = (regel) => {
    opts.onLog?.(regel);
  };
  const soortAnalyse = opts.materialNonlinear ? opts.geometricNonlinear ? "fysisch \xE9n geometrisch niet-lineair" : "fysisch niet-lineair" : opts.geometricNonlinear ? "geometrisch niet-lineair (P-\u0394)" : "lineair";
  log({
    soort: "info",
    tekst: `Model: ${mesh.getNodeCount()} knopen, ${mesh.beamElements.size} staven, ${numDofs} vrijheidsgraden \u2014 ${soortAnalyse}`
  });
  let hasAxialConstraints = false;
  for (const beam of mesh.beamElements.values()) {
    const { start, end } = getConnectionTypes(beam);
    if (start === "tension_only" || start === "pressure_only" || end === "tension_only" || end === "pressure_only") {
      hasAxialConstraints = true;
      break;
    }
  }
  let sectionStates = /* @__PURE__ */ new Map();
  if (opts.materialNonlinear) {
    if (opts.materialType === "concrete") {
      throw new Error(
        "Fysisch niet-lineair beton loopt niet via deze solver. De gescheurde buigstijfheid komt per segment uit de rekenkern (NEN-EN 1992-1-1, M-N-\u03BA met de wapeningskorf) en wordt als section.I van de deelelementen aangeleverd \u2014 zie lib/betonStijfheid.ts."
      );
    }
    const steel = createSteelMaterial(opts.steelFy);
    for (const beam of mesh.beamElements.values()) {
      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;
      const state = initSectionState(beam.section, opts.materialType, steel, void 0);
      sectionStates.set(beam.id, state);
    }
  }
  if (!opts.geometricNonlinear && !opts.materialNonlinear) {
    if (hasAxialConstraints) {
      return solveWithAxialConstraints(mesh, F, opts);
    }
    const K2 = assembleGlobalStiffnessWithGeometric(mesh, axialForces, false);
    log({ soort: "info", tekst: `Stijfheidsmatrix geassembleerd (${K2.rows}\xD7${K2.cols})` });
    const { K: Kbc, F: Fbc } = applyBoundaryConditions(K2, F, mesh);
    log({ soort: "info", tekst: "Randvoorwaarden toegepast" });
    displacements = losFrameStelselOp(Kbc, Fbc, mesh);
    log({ soort: "info", tekst: "Stelsel opgelost \u2014 \xE9\xE9n keer, want lineair" });
    const { beamForces: beamForces2, axialForces: newAxial } = calculateAllInternalForces(mesh, displacements);
    axialForces = newAxial;
    const reactions2 = K2.multiplyVector(displacements);
    for (let i = 0; i < reactions2.length; i++) {
      reactions2[i] = reactions2[i] - F[i];
    }
    let maxVonMises2 = 0;
    for (const forces of beamForces2.values()) {
      maxVonMises2 = Math.max(maxVonMises2, Math.abs(forces.maxM));
    }
    return {
      displacements,
      reactions: reactions2,
      elementStresses: /* @__PURE__ */ new Map(),
      beamForces: beamForces2,
      maxVonMises: maxVonMises2,
      minVonMises: 0
    };
  }
  let beamForces = /* @__PURE__ */ new Map();
  const DIVERGENCE_MSG = "Second-order (P-Delta) analysis did not converge \u2014 the applied load is at or above the critical (buckling) load";
  for (let step = 1; step <= opts.loadSteps; step++) {
    const loadFactor = step / opts.loadSteps;
    const scaledF = F.map((f) => f * loadFactor);
    let converged = false;
    let prevIncrNorm = Infinity;
    let growthCount = 0;
    for (let iter = 0; iter < opts.maxIterations; iter++) {
      let K2;
      if (opts.materialNonlinear) {
        K2 = assembleGlobalStiffnessFNL(
          mesh,
          sectionStates,
          axialForces,
          opts.geometricNonlinear
        );
      } else {
        K2 = assembleGlobalStiffnessWithGeometric(mesh, axialForces, true);
      }
      const { K: Kbc, F: Fbc, fixedDofs } = applyBoundaryConditions(K2, scaledF, mesh);
      const internalForces = K2.multiplyVector(displacements);
      const residual = Fbc.map((f, i) => f - internalForces[i]);
      for (const dof of fixedDofs) residual[dof] = 0;
      let deltaU;
      try {
        deltaU = solveLinearSystem2(Kbc, residual);
      } catch (e) {
        if (opts.geometricNonlinear && !(step === 1 && iter === 0)) throw new Error(DIVERGENCE_MSG);
        throw vertaalSingulier(e, mesh);
      }
      for (let i = 0; i < numDofs; i++) {
        displacements[i] += deltaU[i];
      }
      const forcesResult = calculateAllInternalForces(mesh, displacements);
      axialForces = forcesResult.axialForces;
      beamForces = forcesResult.beamForces;
      if (opts.materialNonlinear) {
        sectionStates = updateAllSectionStates(mesh, displacements, sectionStates, opts);
      }
      const incrNorm = Math.sqrt(deltaU.reduce((s, d) => s + d * d, 0));
      const dispNorm = Math.sqrt(displacements.reduce((s, d) => s + d * d, 0));
      log({
        soort: "iteratie",
        laststap: step,
        iteratie: iter + 1,
        incrementNorm: incrNorm,
        verplaatsingsNorm: dispNorm,
        tekst: `\u2016\u0394u\u2016 = ${incrNorm.toExponential(3)}, \u2016u\u2016 = ${dispNorm.toExponential(3)}`
      });
      if (!Number.isFinite(incrNorm) || !Number.isFinite(dispNorm)) {
        log({ soort: "fout", tekst: "De normen zijn niet-eindig \u2014 het stelsel loopt weg" });
        if (opts.geometricNonlinear) throw new Error(DIVERGENCE_MSG);
        break;
      }
      if (incrNorm <= opts.tolerance * Math.max(dispNorm, 1e-30)) {
        converged = true;
        log({
          soort: "info",
          tekst: `Laststap ${step} geconvergeerd in ${iter + 1} iteratie(s) (tolerantie ${opts.tolerance.toExponential(0)})`
        });
        break;
      }
      if (iter >= 1 && incrNorm > prevIncrNorm) {
        growthCount++;
      } else {
        growthCount = 0;
      }
      if (growthCount >= 3 && opts.geometricNonlinear) {
        log({
          soort: "fout",
          tekst: "De increment-norm groeit drie iteraties op rij \u2014 de last ligt op of boven de kniklast"
        });
        throw new Error(DIVERGENCE_MSG);
      }
      prevIncrNorm = incrNorm;
    }
    if (!converged && !opts.geometricNonlinear) {
      log({
        soort: "waarschuwing",
        tekst: `Laststap ${step} bereikte ${opts.maxIterations} iteraties zonder te convergeren; de laatste stand wordt aangehouden`
      });
    }
    if (!converged && opts.geometricNonlinear) {
      throw new Error(
        `Second-order (P-Delta) analysis did not converge within ${opts.maxIterations} iterations \u2014 the load is at, above, or very close to the critical (buckling) load`
      );
    }
  }
  if (beamForces.size === 0) {
    const forcesResult = calculateAllInternalForces(mesh, displacements);
    beamForces = forcesResult.beamForces;
    axialForces = forcesResult.axialForces;
  }
  let K;
  if (opts.materialNonlinear) {
    K = assembleGlobalStiffnessFNL(
      mesh,
      sectionStates,
      axialForces,
      opts.geometricNonlinear
    );
  } else {
    K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, opts.geometricNonlinear);
  }
  if (opts.geometricNonlinear) {
    const { K: Kstab } = applyBoundaryConditions(K, F, mesh);
    const nietPositief = countNonPositivePivots(Kstab);
    if (nietPositief > 0) {
      log({
        soort: "fout",
        tekst: `Stabiliteitscontrole: ${nietPositief} niet-positieve pivot(s) in K = Ke + Kg \u2014 de matrix is indefiniet en de oplossing fysisch betekenisloos`
      });
      throw new Error(
        "Second-order (P-Delta) analysis is unstable \u2014 the applied load is at or above the critical (buckling) load"
      );
    }
    log({ soort: "info", tekst: "Stabiliteitscontrole: K = Ke + Kg is positief definiet" });
  }
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }
  let maxVonMises = 0;
  for (const forces of beamForces.values()) {
    maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
  }
  return {
    displacements,
    reactions,
    elementStresses: /* @__PURE__ */ new Map(),
    beamForces,
    maxVonMises,
    minVonMises: 0
  };
}
function solvePlateOrPlane(mesh, opts) {
  const analysisType = opts.analysisType;
  const dofsPerNode = getDofsPerNode(analysisType);
  if (mesh.elements.size < 1) {
    throw new Error("Model must have at least 1 plate element");
  }
  const activeNodeIds = buildNodeIdToIndex(mesh, analysisType);
  const elementNodeIds = /* @__PURE__ */ new Set();
  for (const element of mesh.elements.values()) {
    for (const nid of element.nodeIds) {
      elementNodeIds.add(nid);
    }
  }
  const constraintTransfers = [];
  for (const node of mesh.nodes.values()) {
    const hasConstraint = node.constraints.x || node.constraints.y || node.constraints.rotation;
    const hasLoad = node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment && node.loads.moment !== 0;
    if ((hasConstraint || hasLoad) && !activeNodeIds.has(node.id)) {
      let nearestActiveId = null;
      let nearestDist = Infinity;
      for (const activeId of activeNodeIds.keys()) {
        const activeNode = mesh.getNode(activeId);
        if (!activeNode) continue;
        const dist = Math.sqrt((node.x - activeNode.x) ** 2 + (node.y - activeNode.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestActiveId = activeId;
        }
      }
      if (nearestActiveId !== null && nearestDist < 0.5) {
        const targetNode = mesh.getNode(nearestActiveId);
        if (targetNode) {
          if (hasConstraint) {
            targetNode.constraints = {
              x: targetNode.constraints.x || node.constraints.x,
              y: targetNode.constraints.y || node.constraints.y,
              rotation: targetNode.constraints.rotation || node.constraints.rotation,
              springX: node.constraints.springX ?? targetNode.constraints.springX,
              springY: node.constraints.springY ?? targetNode.constraints.springY,
              springRot: node.constraints.springRot ?? targetNode.constraints.springRot
            };
          }
          if (hasLoad) {
            targetNode.loads = {
              fx: targetNode.loads.fx + node.loads.fx,
              fy: targetNode.loads.fy + node.loads.fy,
              moment: (targetNode.loads.moment || 0) + (node.loads.moment || 0)
            };
          }
          constraintTransfers.push({ fromId: node.id, toId: nearestActiveId, dist: nearestDist });
        }
      }
    }
  }
  if (constraintTransfers.length > 0) {
    console.log(`[Plate Solver] Transferred ${constraintTransfers.length} constraint(s) to mesh nodes`);
  }
  let hasActiveConstraints = false;
  let hasAnyConstraints = false;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      hasAnyConstraints = true;
      if (activeNodeIds.has(node.id)) {
        hasActiveConstraints = true;
      }
    }
  }
  if (!hasAnyConstraints) {
    throw new Error("Model has no constraints - add boundary conditions");
  }
  if (!hasActiveConstraints) {
    const problemNodes = [];
    for (const node of mesh.nodes.values()) {
      if ((node.constraints.x || node.constraints.y || node.constraints.rotation) && !activeNodeIds.has(node.id)) {
        problemNodes.push(`Node ${node.id} at (${node.x.toFixed(3)}, ${node.y.toFixed(3)})`);
      }
    }
    throw new Error(`Constraints are not on mesh nodes and couldn't be transferred. Problem nodes: ${problemNodes.join("; ")}`);
  }
  const K = assembleGlobalStiffnessMatrix(mesh, analysisType);
  const F = assembleForceVector(mesh, analysisType);
  const { dofs: constrainedDofs, nodeIdToIndex } = getConstrainedDofs(mesh, analysisType);
  if (constrainedDofs.length < 3) {
    throw new Error(`Insufficient constraints: ${constrainedDofs.length} DOFs constrained, need at least 3 to prevent rigid body motion`);
  }
  const hasLoads = F.some((f) => f !== 0);
  if (!hasLoads) {
    const inactiveLoads = [];
    const activeLoads = [];
    for (const node of mesh.nodes.values()) {
      const hasLoad = node.loads.fx !== 0 || node.loads.fy !== 0 || node.loads.moment && node.loads.moment !== 0;
      if (hasLoad) {
        const isActive = activeNodeIds.has(node.id);
        const info = `Node ${node.id} at (${node.x.toFixed(3)}, ${node.y.toFixed(3)}): fx=${node.loads.fx}, fy=${node.loads.fy}`;
        if (isActive) activeLoads.push(info);
        else inactiveLoads.push(info);
      }
    }
    if (inactiveLoads.length > 0) {
      throw new Error(`Loads on ${inactiveLoads.length} node(s) not connected to elements (inactive). Loads: ${inactiveLoads.join("; ")}. Total elements: ${mesh.elements.size}`);
    }
    throw new Error("No loads applied - add forces to nodes or elements");
  }
  const numDofs = K.rows;
  const indexToNodeId = /* @__PURE__ */ new Map();
  for (const [nodeId, idx] of nodeIdToIndex.entries()) indexToNodeId.set(idx, nodeId);
  const constrainedSet = new Set(constrainedDofs);
  for (let d = 0; d < numDofs; d++) {
    if (Math.abs(K.get(d, d)) < 1e-20 && !constrainedSet.has(d)) {
      const nodeIdx = Math.floor(d / dofsPerNode);
      const localDof = d % dofsPerNode;
      const nodeId = indexToNodeId.get(nodeIdx);
      const node = nodeId !== void 0 ? mesh.getNode(nodeId) : null;
      const dofLabel = dofsPerNode === 2 ? ["u", "v"][localDof] : ["u/w", "v/\u03B8x", "\u03B8/\u03B8y"][localDof];
      console.warn(`[Plate Solver] Zero stiffness at DOF ${d} (node ${nodeId} at (${node?.x.toFixed(3)}, ${node?.y.toFixed(3)}), dof=${dofLabel}) \u2014 auto-constraining`);
      constrainedDofs.push(d);
      constrainedSet.add(d);
    }
  }
  const Kmod = K.clone();
  const Fmod = [...F];
  const penalty = 1e20;
  for (const dof of constrainedDofs) {
    Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
    Fmod[dof] = 0;
  }
  let displacements;
  try {
    displacements = solveLinearSystem2(Kmod, Fmod);
  } catch (e) {
    const msg = e.message;
    const colMatch = msg.match(/column (\d+)/);
    if (colMatch) {
      const col = parseInt(colMatch[1]);
      const nodeIdx = Math.floor(col / dofsPerNode);
      const localDof = col % dofsPerNode;
      const nodeId = indexToNodeId.get(nodeIdx);
      const node = nodeId !== void 0 ? mesh.getNode(nodeId) : null;
      const dofLabel = dofsPerNode === 2 ? ["u", "v"][localDof] : ["u/w", "v/\u03B8x", "\u03B8/\u03B8y"][localDof];
      throw new Error(`Singular matrix at DOF ${col}: node ${nodeId} at (${node?.x.toFixed(3)}, ${node?.y.toFixed(3)}), direction=${dofLabel}. Check boundary conditions and element connectivity.`);
    }
    throw e;
  }
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }
  const elementStresses = /* @__PURE__ */ new Map();
  let maxVonMises = 0;
  let minVonMises = Infinity;
  let maxMoment = -Infinity;
  let minMoment = Infinity;
  const ranges = {
    sigmaX: { min: Infinity, max: -Infinity },
    sigmaY: { min: Infinity, max: -Infinity },
    tauXY: { min: Infinity, max: -Infinity },
    mx: { min: Infinity, max: -Infinity },
    my: { min: Infinity, max: -Infinity },
    mxy: { min: Infinity, max: -Infinity },
    vx: { min: Infinity, max: -Infinity },
    vy: { min: Infinity, max: -Infinity },
    nx: { min: Infinity, max: -Infinity },
    ny: { min: Infinity, max: -Infinity },
    nxy: { min: Infinity, max: -Infinity }
  };
  for (const element of mesh.elements.values()) {
    const nodes = mesh.getElementNodes(element);
    if (nodes.length < 3 || nodes.length > 4) continue;
    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;
    const elemDisp = [];
    for (const node of nodes) {
      const idx = nodeIdToIndex.get(node.id);
      if (idx === void 0) continue;
      for (let d = 0; d < dofsPerNode; d++) {
        elemDisp.push(displacements[idx * dofsPerNode + d]);
      }
    }
    if (analysisType === "plate_bending") {
      if (nodes.length !== 3) continue;
      const [n1, n2, n3] = nodes;
      const moments = calculateElementMoments(n1, n2, n3, material, element.thickness, elemDisp);
      const shear = calculateElementShearForces(n1, n2, n3, material, element.thickness, elemDisp);
      const stress = {
        elementId: element.id,
        sigmaX: 0,
        sigmaY: 0,
        tauXY: 0,
        vonMises: 0,
        principalStresses: { sigma1: 0, sigma2: 0, angle: 0 },
        mx: moments.mx,
        my: moments.my,
        mxy: moments.mxy,
        vx: shear.vx,
        vy: shear.vy
      };
      elementStresses.set(element.id, stress);
      maxMoment = Math.max(maxMoment, moments.mx, moments.my, moments.mxy);
      minMoment = Math.min(minMoment, moments.mx, moments.my, moments.mxy);
      ranges.mx.min = Math.min(ranges.mx.min, moments.mx);
      ranges.mx.max = Math.max(ranges.mx.max, moments.mx);
      ranges.my.min = Math.min(ranges.my.min, moments.my);
      ranges.my.max = Math.max(ranges.my.max, moments.my);
      ranges.mxy.min = Math.min(ranges.mxy.min, moments.mxy);
      ranges.mxy.max = Math.max(ranges.mxy.max, moments.mxy);
      ranges.vx.min = Math.min(ranges.vx.min, shear.vx);
      ranges.vx.max = Math.max(ranges.vx.max, shear.vx);
      ranges.vy.min = Math.min(ranges.vy.min, shear.vy);
      ranges.vy.max = Math.max(ranges.vy.max, shear.vy);
    } else {
      let stress;
      if (nodes.length === 4) {
        const [n1, n2, n3, n4] = nodes;
        stress = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, analysisType);
      } else {
        const [n1, n2, n3] = nodes;
        stress = calculateElementStress(n1, n2, n3, material, elemDisp, analysisType);
      }
      const principal = calculatePrincipalStresses(stress.sigmaX, stress.sigmaY, stress.tauXY);
      const thickness = element.thickness || 1;
      const nx = stress.sigmaX * thickness;
      const ny = stress.sigmaY * thickness;
      const nxy = stress.tauXY * thickness;
      elementStresses.set(element.id, {
        elementId: element.id,
        ...stress,
        principalStresses: principal,
        nx,
        ny,
        nxy
      });
      maxVonMises = Math.max(maxVonMises, stress.vonMises);
      minVonMises = Math.min(minVonMises, stress.vonMises);
      ranges.sigmaX.min = Math.min(ranges.sigmaX.min, stress.sigmaX);
      ranges.sigmaX.max = Math.max(ranges.sigmaX.max, stress.sigmaX);
      ranges.sigmaY.min = Math.min(ranges.sigmaY.min, stress.sigmaY);
      ranges.sigmaY.max = Math.max(ranges.sigmaY.max, stress.sigmaY);
      ranges.tauXY.min = Math.min(ranges.tauXY.min, stress.tauXY);
      ranges.tauXY.max = Math.max(ranges.tauXY.max, stress.tauXY);
      ranges.nx.min = Math.min(ranges.nx.min, nx);
      ranges.nx.max = Math.max(ranges.nx.max, nx);
      ranges.ny.min = Math.min(ranges.ny.min, ny);
      ranges.ny.max = Math.max(ranges.ny.max, ny);
      ranges.nxy.min = Math.min(ranges.nxy.min, nxy);
      ranges.nxy.max = Math.max(ranges.nxy.max, nxy);
    }
  }
  if (minVonMises === Infinity) minVonMises = 0;
  if (maxMoment === -Infinity) maxMoment = 0;
  if (minMoment === Infinity) minMoment = 0;
  for (const key of Object.keys(ranges)) {
    if (ranges[key].min === Infinity) ranges[key].min = 0;
    if (ranges[key].max === -Infinity) ranges[key].max = 0;
  }
  return {
    displacements,
    reactions,
    elementStresses,
    beamForces: /* @__PURE__ */ new Map(),
    maxVonMises,
    minVonMises,
    maxMoment: analysisType === "plate_bending" ? maxMoment : void 0,
    minMoment: analysisType === "plate_bending" ? minMoment : void 0,
    stressRanges: ranges
  };
}
function assembleGeometricStiffnessMixed(mesh, displacements, nodeIdToIndex, numDofs) {
  const Kg = new Matrix(numDofs, numDofs);
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;
    const [n1, n2] = nodes;
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    if (idx1 === void 0 || idx2 === void 0) continue;
    const L = calculateBeamLength(n1, n2);
    if (L < 1e-10) continue;
    const angle = calculateBeamAngle(n1, n2);
    const dofIndices = [
      idx1 * 3,
      idx1 * 3 + 1,
      idx1 * 3 + 2,
      idx2 * 3,
      idx2 * 3 + 1,
      idx2 * 3 + 2
    ];
    const T = createTransformationMatrix(angle);
    const ug = dofIndices.map((d) => displacements[d]);
    const ul = T.multiplyVector(ug);
    const N = material.E * beam.section.A / L * (ul[3] - ul[0]);
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    const veren = getSprungLocalDofs(beam);
    let KgLokaal;
    if (releasedLocalDofs.length === 0 && veren.length === 0) {
      KgLokaal = calculateGeometricStiffness(L, N);
    } else {
      const condenseer = (M) => {
        if (veren.length > 0) applyEndConnections(M, releasedLocalDofs, veren);
        else applyEndReleases(M, releasedLocalDofs);
        return M;
      };
      const KeAlleen = condenseer(
        calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I)
      );
      const KeMetKg = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
      telGeometrischeStijfheidOp(KeMetKg, L, N);
      condenseer(KeMetKg);
      KgLokaal = new Matrix(6, 6);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          KgLokaal.set(i, j, KeMetKg.get(i, j) - KeAlleen.get(i, j));
        }
      }
    }
    const KgGlobaal = T.transpose().multiply(KgLokaal.multiply(T));
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        Kg.addAt(dofIndices[i], dofIndices[j], KgGlobaal.get(i, j));
      }
    }
  }
  for (const element of mesh.elements.values()) {
    const nodes = mesh.getElementNodes(element);
    if (nodes.length < 3 || nodes.length > 4) continue;
    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;
    const dofIndices = [];
    const elemDisp = [];
    let compleet = true;
    for (const node of nodes) {
      const idx = nodeIdToIndex.get(node.id);
      if (idx === void 0) {
        compleet = false;
        break;
      }
      dofIndices.push(idx * 3, idx * 3 + 1, idx * 3 + 2);
      elemDisp.push(displacements[idx * 3], displacements[idx * 3 + 1]);
    }
    if (!compleet) continue;
    try {
      if (nodes.length === 4) {
        const [n1, n2, n3, n4] = nodes;
        const s = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, "plane_stress");
        const Kg12 = expandQuadGeometricStiffness(
          calculateQuadGeometricStiffness(n1, n2, n3, n4, s, element.thickness)
        );
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 12; j++) Kg.addAt(dofIndices[i], dofIndices[j], Kg12.get(i, j));
        }
      } else {
        const [n1, n2, n3] = nodes;
        const s = calculateElementStress(n1, n2, n3, material, elemDisp, "plane_stress");
        const Kg9 = expandTriangleGeometricStiffness(
          calculateTriangleGeometricStiffness(n1, n2, n3, s, element.thickness)
        );
        for (let i = 0; i < 9; i++) {
          for (let j = 0; j < 9; j++) Kg.addAt(dofIndices[i], dofIndices[j], Kg9.get(i, j));
        }
      }
    } catch (e) {
      throw new PlaatElementFout(
        element.id,
        e instanceof Error ? e.message : String(e),
        nodes
      );
    }
  }
  return Kg;
}
function solveMixed(mesh, opts) {
  const analysisType = "mixed_beam_plate";
  const dofsPerNode = 3;
  const log = (regel) => {
    opts.onLog?.(regel);
  };
  if (mesh.elements.size < 1 && mesh.getBeamCount() < 1) {
    throw new Error("Mixed analysis requires at least one plate or beam element");
  }
  const activeNodeIds = buildNodeIdToIndex(mesh, analysisType);
  let hasActiveConstraints = false;
  let hasAnyConstraints = false;
  for (const node of mesh.nodes.values()) {
    if (node.constraints.x || node.constraints.y || node.constraints.rotation) {
      hasAnyConstraints = true;
      if (activeNodeIds.has(node.id)) {
        hasActiveConstraints = true;
      }
    }
  }
  if (!hasAnyConstraints) {
    throw new Error("Model has no constraints - add boundary conditions");
  }
  if (!hasActiveConstraints) {
    throw new Error("Constraints are not on mesh nodes - place supports on plate corner/edge nodes or beam nodes");
  }
  const K = assembleGlobalStiffnessMatrix(mesh, analysisType);
  const F = assembleForceVector(mesh, analysisType);
  const { dofs: constrainedDofs, nodeIdToIndex } = getConstrainedDofs(mesh, analysisType);
  if (constrainedDofs.length < 3) {
    throw new Error(`Insufficient constraints: ${constrainedDofs.length} DOFs constrained, need at least 3 to prevent rigid body motion`);
  }
  const hasLoads = F.some((f) => f !== 0);
  if (!hasLoads) {
    throw new Error("No loads applied - add forces to nodes or elements");
  }
  const slaafDofs = [];
  for (const k of opts.randKoppelingen ?? []) {
    const si = nodeIdToIndex.get(k.slaafKnoopId);
    if (si === void 0) {
      throw new Error(`Randkoppeling: knoop ${k.slaafKnoopId} is geen actieve rekenknoop.`);
    }
    const som = k.meesters.reduce((s, m) => s + m.gewicht, 0);
    if (!(Math.abs(som - 1) <= 1e-9)) {
      throw new Error(`Randkoppeling van knoop ${k.slaafKnoopId}: de gewichten tellen op tot ${som}, niet 1.`);
    }
    for (const d of [0, 1]) {
      slaafDofs.push({
        dof: si * dofsPerNode + d,
        meesters: k.meesters.map((m) => {
          const mi = nodeIdToIndex.get(m.knoopId);
          if (mi === void 0) {
            throw new Error(`Randkoppeling van knoop ${k.slaafKnoopId}: meester ${m.knoopId} is geen actieve rekenknoop.`);
          }
          return { dof: mi * dofsPerNode + d, w: m.gewicht };
        })
      });
    }
  }
  const slaafSet = new Set(slaafDofs.map((s) => s.dof));
  for (const s of slaafDofs) {
    if (s.meesters.some((m) => slaafSet.has(m.dof))) {
      throw new Error("Randkoppeling: een meesterknoop is zelf aan een rand gekoppeld.");
    }
  }
  if (constrainedDofs.some((d) => slaafSet.has(d))) {
    throw new Error("Randkoppeling: een aan een plaatrand gekoppelde knoop draagt een starre oplegging.");
  }
  if (slaafDofs.length > 0) {
    log({
      soort: "info",
      tekst: `${slaafDofs.length / 2} staafknopen kinematisch aan een plaatrand gekoppeld (lineaire interpolatie)`
    });
  }
  const gecondenseerdeKloon = (M) => {
    const C = M.clone();
    if (slaafDofs.length === 0) return C;
    const a = C.data;
    const n = C.rows;
    for (const sl of slaafDofs) {
      for (const m of sl.meesters) {
        if (m.w === 0) continue;
        for (let i = 0; i < n; i++) a[i][m.dof] += m.w * a[i][sl.dof];
      }
      for (let i = 0; i < n; i++) a[i][sl.dof] = 0;
    }
    for (const sl of slaafDofs) {
      const rij = a[sl.dof];
      for (const m of sl.meesters) {
        if (m.w === 0) continue;
        const doel = a[m.dof];
        for (let j = 0; j < n; j++) doel[j] += m.w * rij[j];
      }
      for (let j = 0; j < n; j++) rij[j] = 0;
      rij[sl.dof] = 1;
    }
    return C;
  };
  const Fc = slaafDofs.length === 0 ? F : (() => {
    const g = [...F];
    for (const sl of slaafDofs) {
      for (const m of sl.meesters) g[m.dof] += m.w * F[sl.dof];
      g[sl.dof] = 0;
    }
    return g;
  })();
  const herstel = (u) => {
    for (const sl of slaafDofs) {
      let v = 0;
      for (const m of sl.meesters) v += m.w * u[m.dof];
      u[sl.dof] = v;
    }
    return u;
  };
  const losOp = (Kt) => {
    const Kmod = gecondenseerdeKloon(Kt);
    const Fmod = [...Fc];
    const penalty = 1e20;
    for (const dof of constrainedDofs) {
      Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
      Fmod[dof] = 0;
    }
    return herstel(solveLinearSystem2(Kmod, Fmod));
  };
  const knoopVanIndex = /* @__PURE__ */ new Map();
  for (const [id, index] of nodeIdToIndex) knoopVanIndex.set(index, { id });
  const numDofsMixed = K.rows;
  log({
    soort: "info",
    tekst: `Gemengd model: ${mesh.beamElements.size} staven en ${mesh.elements.size} schijfelementen, ${numDofsMixed} vrijheidsgraden` + (opts.geometricNonlinear ? " \u2014 geometrisch niet-lineair (P-\u0394)" : " \u2014 lineair")
  });
  let displacements;
  try {
    displacements = losOp(K);
  } catch (e) {
    throw vertaalSingulier(e, mesh, (i) => knoopVanIndex.get(i));
  }
  let Kreactie = K;
  if (opts.geometricNonlinear) {
    let vorigeNorm = Infinity;
    let groei = 0;
    let geconvergeerd = false;
    for (let iter = 0; iter < opts.maxIterations; iter++) {
      const Kg2 = assembleGeometricStiffnessMixed(
        mesh,
        displacements,
        nodeIdToIndex,
        numDofsMixed
      );
      const Kt2 = K.clone();
      for (let i = 0; i < numDofsMixed; i++) {
        for (let j = 0; j < numDofsMixed; j++) Kt2.addAt(i, j, Kg2.get(i, j));
      }
      let nieuw;
      try {
        nieuw = losOp(Kt2);
      } catch {
        log({ soort: "fout", tekst: "Het stelsel K = Ke + Kg is niet oplosbaar" });
        throw new Error(
          "Second-order (P-Delta) analysis is unstable \u2014 the applied load is at or above the critical (buckling) load"
        );
      }
      let som = 0, somU = 0;
      for (let i = 0; i < numDofsMixed; i++) {
        const d = nieuw[i] - displacements[i];
        som += d * d;
        somU += nieuw[i] * nieuw[i];
      }
      const incrNorm = Math.sqrt(som);
      const dispNorm = Math.sqrt(somU);
      displacements = nieuw;
      log({
        soort: "iteratie",
        laststap: 1,
        iteratie: iter + 1,
        incrementNorm: incrNorm,
        verplaatsingsNorm: dispNorm,
        tekst: `\u2016\u0394u\u2016 = ${incrNorm.toExponential(3)}, \u2016u\u2016 = ${dispNorm.toExponential(3)}`
      });
      if (!Number.isFinite(incrNorm) || !Number.isFinite(dispNorm)) {
        log({ soort: "fout", tekst: "De normen zijn niet-eindig \u2014 het stelsel loopt weg" });
        throw new Error(
          "Second-order (P-Delta) analysis did not converge \u2014 the applied load is at or above the critical (buckling) load"
        );
      }
      if (incrNorm <= opts.tolerance * Math.max(dispNorm, 1e-30)) {
        geconvergeerd = true;
        log({
          soort: "info",
          tekst: `Geconvergeerd in ${iter + 1} iteratie(s) (tolerantie ${opts.tolerance.toExponential(0)})`
        });
        break;
      }
      if (iter >= 1 && incrNorm > vorigeNorm) groei++;
      else groei = 0;
      if (groei >= 3) {
        log({
          soort: "fout",
          tekst: "De increment-norm groeit drie iteraties op rij \u2014 de last ligt op of boven de kniklast"
        });
        throw new Error(
          "Second-order (P-Delta) analysis did not converge \u2014 the applied load is at or above the critical (buckling) load"
        );
      }
      vorigeNorm = incrNorm;
    }
    if (!geconvergeerd) {
      throw new Error(
        `Second-order (P-Delta) analysis did not converge within ${opts.maxIterations} iterations \u2014 the load is at, above, or very close to the critical (buckling) load`
      );
    }
    const Kg = assembleGeometricStiffnessMixed(
      mesh,
      displacements,
      nodeIdToIndex,
      numDofsMixed
    );
    const Kt = K.clone();
    for (let i = 0; i < numDofsMixed; i++) {
      for (let j = 0; j < numDofsMixed; j++) Kt.addAt(i, j, Kg.get(i, j));
    }
    Kreactie = Kt;
    const Kstab = gecondenseerdeKloon(Kt);
    for (const dof of constrainedDofs) Kstab.set(dof, dof, Kstab.get(dof, dof) + 1e20);
    const nietPositief = countNonPositivePivots(Kstab);
    if (nietPositief > 0) {
      log({
        soort: "fout",
        tekst: `Stabiliteitscontrole: ${nietPositief} niet-positieve pivot(s) in K = Ke + Kg \u2014 de matrix is indefiniet en de oplossing fysisch betekenisloos`
      });
      throw new Error(
        "Second-order (P-Delta) analysis is unstable \u2014 the applied load is at or above the critical (buckling) load"
      );
    }
    log({ soort: "info", tekst: "Stabiliteitscontrole: K = Ke + Kg is positief definiet" });
  }
  const reactions = slaafDofs.length === 0 ? Kreactie.multiplyVector(displacements) : gecondenseerdeKloon(Kreactie).multiplyVector(
    displacements.map((v, i) => slaafSet.has(i) ? 0 : v)
  );
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - Fc[i];
  }
  const beamForces = /* @__PURE__ */ new Map();
  for (const beam of mesh.beamElements.values()) {
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const material = mesh.getMaterial(beam.materialId);
    if (!material) continue;
    const [n1, n2] = nodes;
    const idx1 = nodeIdToIndex.get(n1.id);
    const idx2 = nodeIdToIndex.get(n2.id);
    if (idx1 === void 0 || idx2 === void 0) continue;
    const globalDisp = [
      displacements[idx1 * dofsPerNode],
      // u1
      displacements[idx1 * dofsPerNode + 1],
      // v1
      displacements[idx1 * dofsPerNode + 2],
      // θ1
      displacements[idx2 * dofsPerNode],
      // u2
      displacements[idx2 * dofsPerNode + 1],
      // v2
      displacements[idx2 * dofsPerNode + 2]
      // θ2
    ];
    const forces = calculateBeamInternalForces(beam, n1, n2, material, globalDisp);
    beamForces.set(beam.id, forces);
  }
  const elementStresses = /* @__PURE__ */ new Map();
  let maxVonMises = 0;
  let minVonMises = Infinity;
  const ranges = {
    sigmaX: { min: Infinity, max: -Infinity },
    sigmaY: { min: Infinity, max: -Infinity },
    tauXY: { min: Infinity, max: -Infinity },
    mx: { min: Infinity, max: -Infinity },
    my: { min: Infinity, max: -Infinity },
    mxy: { min: Infinity, max: -Infinity },
    vx: { min: Infinity, max: -Infinity },
    vy: { min: Infinity, max: -Infinity },
    nx: { min: Infinity, max: -Infinity },
    ny: { min: Infinity, max: -Infinity },
    nxy: { min: Infinity, max: -Infinity }
  };
  for (const element of mesh.elements.values()) {
    const nodes = mesh.getElementNodes(element);
    if (nodes.length < 3 || nodes.length > 4) continue;
    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;
    const elemDisp = [];
    for (const node of nodes) {
      const idx = nodeIdToIndex.get(node.id);
      if (idx === void 0) continue;
      elemDisp.push(displacements[idx * dofsPerNode]);
      elemDisp.push(displacements[idx * dofsPerNode + 1]);
    }
    let stress;
    if (nodes.length === 4) {
      const [n1, n2, n3, n4] = nodes;
      stress = calculateQuadStress(n1, n2, n3, n4, material, elemDisp, "plane_stress");
    } else {
      const [n1, n2, n3] = nodes;
      stress = calculateElementStress(n1, n2, n3, material, elemDisp, "plane_stress");
    }
    const principal = calculatePrincipalStresses(stress.sigmaX, stress.sigmaY, stress.tauXY);
    const thickness = element.thickness || 1;
    const nx = stress.sigmaX * thickness;
    const ny = stress.sigmaY * thickness;
    const nxy = stress.tauXY * thickness;
    elementStresses.set(element.id, {
      elementId: element.id,
      ...stress,
      principalStresses: principal,
      nx,
      ny,
      nxy
    });
    maxVonMises = Math.max(maxVonMises, stress.vonMises);
    minVonMises = Math.min(minVonMises, stress.vonMises);
    ranges.sigmaX.min = Math.min(ranges.sigmaX.min, stress.sigmaX);
    ranges.sigmaX.max = Math.max(ranges.sigmaX.max, stress.sigmaX);
    ranges.sigmaY.min = Math.min(ranges.sigmaY.min, stress.sigmaY);
    ranges.sigmaY.max = Math.max(ranges.sigmaY.max, stress.sigmaY);
    ranges.tauXY.min = Math.min(ranges.tauXY.min, stress.tauXY);
    ranges.tauXY.max = Math.max(ranges.tauXY.max, stress.tauXY);
    ranges.nx.min = Math.min(ranges.nx.min, nx);
    ranges.nx.max = Math.max(ranges.nx.max, nx);
    ranges.ny.min = Math.min(ranges.ny.min, ny);
    ranges.ny.max = Math.max(ranges.ny.max, ny);
    ranges.nxy.min = Math.min(ranges.nxy.min, nxy);
    ranges.nxy.max = Math.max(ranges.nxy.max, nxy);
  }
  if (minVonMises === Infinity) minVonMises = 0;
  for (const key of Object.keys(ranges)) {
    if (ranges[key].min === Infinity) ranges[key].min = 0;
    if (ranges[key].max === -Infinity) ranges[key].max = 0;
  }
  return {
    displacements,
    reactions,
    elementStresses,
    beamForces,
    maxVonMises,
    minVonMises,
    stressRanges: ranges
  };
}
function solveWithAxialConstraints(mesh, F, opts) {
  const maxIter = opts.maxIterations || 20;
  const axialReleasedBeamIds = /* @__PURE__ */ new Set();
  for (let iter = 0; iter < maxIter; iter++) {
    const K2 = assembleGlobalStiffnessMatrix(mesh, "frame", axialReleasedBeamIds);
    const { K: Kbc2, F: Fbc2 } = applyBoundaryConditions(K2, F, mesh);
    const displacements2 = losFrameStelselOp(Kbc2, Fbc2, mesh);
    const { beamForces: beamForces2, axialForces } = calculateAllInternalForces(mesh, displacements2);
    let changed = false;
    for (const beam of mesh.beamElements.values()) {
      const { start, end } = getConnectionTypes(beam);
      const hasTensionOnly = start === "tension_only" || end === "tension_only";
      const hasPressureOnly = start === "pressure_only" || end === "pressure_only";
      if (!hasTensionOnly && !hasPressureOnly) continue;
      const N = axialForces.get(beam.id) ?? 0;
      const shouldRelease = hasTensionOnly && N < 0 || // compression in tension-only → release
      hasPressureOnly && N > 0;
      const isReleased = axialReleasedBeamIds.has(beam.id);
      if (shouldRelease && !isReleased) {
        axialReleasedBeamIds.add(beam.id);
        changed = true;
      } else if (!shouldRelease && isReleased) {
        axialReleasedBeamIds.delete(beam.id);
        changed = true;
      }
    }
    if (!changed) {
      const reactions2 = K2.multiplyVector(displacements2);
      for (let i = 0; i < reactions2.length; i++) {
        reactions2[i] = reactions2[i] - F[i];
      }
      let maxVonMises2 = 0;
      for (const forces of beamForces2.values()) {
        maxVonMises2 = Math.max(maxVonMises2, Math.abs(forces.maxM));
      }
      return {
        displacements: displacements2,
        reactions: reactions2,
        elementStresses: /* @__PURE__ */ new Map(),
        beamForces: beamForces2,
        maxVonMises: maxVonMises2,
        minVonMises: 0
      };
    }
  }
  const K = assembleGlobalStiffnessMatrix(mesh, "frame", axialReleasedBeamIds);
  const { K: Kbc, F: Fbc } = applyBoundaryConditions(K, F, mesh);
  const displacements = losFrameStelselOp(Kbc, Fbc, mesh);
  const { beamForces } = calculateAllInternalForces(mesh, displacements);
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }
  let maxVonMises = 0;
  for (const forces of beamForces.values()) {
    maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
  }
  console.warn("Axial constraint iteration did not converge within", maxIter, "iterations");
  return {
    displacements,
    reactions,
    elementStresses: /* @__PURE__ */ new Map(),
    beamForces,
    maxVonMises,
    minVonMises: 0
  };
}

// src/core/fem/PlateRegion.ts
function generatePlateRegionMesh(mesh, config) {
  const { x, y, width, height, divisionsX, divisionsY, materialId, thickness } = config;
  const elementType = config.elementType ?? "triangle";
  const nx = divisionsX;
  const ny = divisionsY;
  const nodeGrid = [];
  const allNodeIds = [];
  for (let j = 0; j <= ny; j++) {
    nodeGrid[j] = [];
    for (let i = 0; i <= nx; i++) {
      const nodeX = x + i / nx * width;
      const nodeY = y + j / ny * height;
      const existing = mesh.findNodeAt(nodeX, nodeY, 1e-3);
      if (existing) {
        nodeGrid[j][i] = existing.id;
      } else {
        const newNode = mesh.addPlateNode(nodeX, nodeY);
        nodeGrid[j][i] = newNode.id;
      }
      if (!allNodeIds.includes(nodeGrid[j][i])) {
        allNodeIds.push(nodeGrid[j][i]);
      }
    }
  }
  const allElementIds = [];
  if (elementType === "quad") {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n0 = nodeGrid[j][i];
        const n1 = nodeGrid[j][i + 1];
        const n2 = nodeGrid[j + 1][i + 1];
        const n3 = nodeGrid[j + 1][i];
        const q = mesh.addQuadElement([n0, n1, n2, n3], materialId, thickness);
        if (q) allElementIds.push(q.id);
      }
    }
  } else {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n0 = nodeGrid[j][i];
        const n1 = nodeGrid[j][i + 1];
        const n2 = nodeGrid[j + 1][i + 1];
        const n3 = nodeGrid[j + 1][i];
        const t1 = mesh.addTriangleElement([n0, n1, n2], materialId, thickness);
        if (t1) allElementIds.push(t1.id);
        const t2 = mesh.addTriangleElement([n0, n2, n3], materialId, thickness);
        if (t2) allElementIds.push(t2.id);
      }
    }
  }
  const bottomEdge = [];
  for (let i = 0; i <= nx; i++) bottomEdge.push(nodeGrid[0][i]);
  const topEdge = [];
  for (let i = 0; i <= nx; i++) topEdge.push(nodeGrid[ny][i]);
  const leftEdge = [];
  for (let j = 0; j <= ny; j++) leftEdge.push(nodeGrid[j][0]);
  const rightEdge = [];
  for (let j = 0; j <= ny; j++) rightEdge.push(nodeGrid[j][nx]);
  const cornerNodeIds = [
    nodeGrid[0][0],
    // BL
    nodeGrid[0][nx],
    // BR
    nodeGrid[ny][nx],
    // TR
    nodeGrid[ny][0]
    // TL
  ];
  return {
    id: 0,
    // Will be assigned by Mesh.addPlateRegion
    x,
    y,
    width,
    height,
    divisionsX,
    divisionsY,
    materialId,
    thickness,
    elementType,
    nodeIds: allNodeIds,
    cornerNodeIds,
    elementIds: allElementIds,
    edges: {
      bottom: { nodeIds: bottomEdge },
      top: { nodeIds: topEdge },
      left: { nodeIds: leftEdge },
      right: { nodeIds: rightEdge }
    }
  };
}
function convertEdgeNodeIdsToNodalForces(mesh, nodeIds, px, py) {
  if (nodeIds.length < 2) return [];
  const nodes = nodeIds.map((id) => mesh.getNode(id)).filter((n) => n !== void 0);
  if (nodes.length < 2) return [];
  const cumDist = [0];
  for (let i = 1; i < nodes.length; i++) {
    const dx = nodes[i].x - nodes[i - 1].x;
    const dy = nodes[i].y - nodes[i - 1].y;
    cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLen = cumDist[cumDist.length - 1];
  if (totalLen < 1e-12) return [];
  const forces = [];
  for (let i = 0; i < nodes.length; i++) {
    let tributaryLength = 0;
    if (i > 0) {
      tributaryLength += (cumDist[i] - cumDist[i - 1]) / 2;
    }
    if (i < nodes.length - 1) {
      tributaryLength += (cumDist[i + 1] - cumDist[i]) / 2;
    }
    forces.push({
      nodeId: nodes[i].id,
      fx: px * tributaryLength,
      fy: py * tributaryLength
    });
  }
  return forces;
}

// src/core/fem/PlateLoads.ts
var STANDARD_GRAVITY = 9.81;
function computeElementArea(mesh, element) {
  const nodes = element.nodeIds.map((nid) => mesh.getNode(nid));
  if (nodes.some((n2) => n2 === void 0)) return 0;
  let sum = 0;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
function computeSelfWeightNodalForces(mesh, options = {}) {
  const g = options.g ?? STANDARD_GRAVITY;
  const elements = [];
  if (options.elementIds) {
    for (const eid of options.elementIds) {
      const el = mesh.getElement(eid);
      if (el) elements.push(el);
    }
  } else {
    elements.push(...mesh.elements.values());
  }
  const perNode = /* @__PURE__ */ new Map();
  for (const element of elements) {
    const nNodes = element.nodeIds.length;
    if (nNodes !== 3 && nNodes !== 4) continue;
    const material = mesh.getMaterial(element.materialId);
    if (!material) continue;
    const area = computeElementArea(mesh, element);
    const weight = material.rho * g * element.thickness * area;
    const share = weight / nNodes;
    for (const nid of element.nodeIds) {
      perNode.set(nid, (perNode.get(nid) ?? 0) - share);
    }
  }
  const forces = [];
  for (const [nodeId, fy] of perNode) {
    forces.push({ nodeId, fx: 0, fy });
  }
  return forces;
}
function computeEdgeLoadNodalForces(mesh, edgeNodeIds, px, py) {
  return convertEdgeNodeIdsToNodalForces(mesh, edgeNodeIds, px, py);
}
function verdeelRandlastConsistent(nodeIds, s, sA, sB, pxA, pyA, pxB, pyB) {
  const perKnoop = /* @__PURE__ */ new Map();
  const tel = (nodeId, fx, fy) => {
    const oud = perKnoop.get(nodeId) ?? { fx: 0, fy: 0 };
    perKnoop.set(nodeId, { fx: oud.fx + fx, fy: oud.fy + fy });
  };
  const lengte = sB - sA;
  if (!(lengte > 0)) return [];
  const px = (x) => pxA + (pxB - pxA) * ((x - sA) / lengte);
  const py = (x) => pyA + (pyB - pyA) * ((x - sA) / lengte);
  for (let j = 0; j + 1 < nodeIds.length; j++) {
    const s0 = s[j], s1 = s[j + 1];
    const l = s1 - s0;
    if (!(l > 0)) continue;
    const lo = Math.max(s0, sA);
    const hi = Math.min(s1, sB);
    if (!(hi > lo)) continue;
    const m = 0.5 * (lo + hi);
    const w = (hi - lo) / 6;
    const Nj = (x) => (s1 - x) / l;
    const Nk = (x) => (x - s0) / l;
    tel(
      nodeIds[j],
      w * (Nj(lo) * px(lo) + 4 * Nj(m) * px(m) + Nj(hi) * px(hi)),
      w * (Nj(lo) * py(lo) + 4 * Nj(m) * py(m) + Nj(hi) * py(hi))
    );
    tel(
      nodeIds[j + 1],
      w * (Nk(lo) * px(lo) + 4 * Nk(m) * px(m) + Nk(hi) * px(hi)),
      w * (Nk(lo) * py(lo) + 4 * Nk(m) * py(m) + Nk(hi) * py(hi))
    );
  }
  return nodeIds.filter((id) => perKnoop.has(id)).map((id) => ({ nodeId: id, ...perKnoop.get(id) }));
}
function verdeelRandpuntlastConsistent(nodeIds, s, sP, fx, fy) {
  const n = nodeIds.length;
  if (n === 0) return [];
  const x = Math.min(s[n - 1], Math.max(s[0], sP));
  for (let j = 0; j + 1 < n; j++) {
    const s0 = s[j], s1 = s[j + 1];
    if (x < s0 || x > s1) continue;
    const l = s1 - s0;
    if (!(l > 0)) continue;
    const t = (x - s0) / l;
    return [
      { nodeId: nodeIds[j], fx: (1 - t) * fx, fy: (1 - t) * fy },
      { nodeId: nodeIds[j + 1], fx: t * fx, fy: t * fy }
    ];
  }
  return [{ nodeId: nodeIds[0], fx, fy }];
}
function applyNodalForces(mesh, forces) {
  for (const f of forces) {
    const node = mesh.getNode(f.nodeId);
    if (!node) continue;
    mesh.updateNode(f.nodeId, {
      loads: {
        ...node.loads,
        fx: node.loads.fx + f.fx,
        fy: node.loads.fy + f.fy
      }
    });
  }
}

// src/components/fem/femTypes.ts
var BEAM_LOAD_ROLES = [
  { id: "gevelLinks", label: "Linkergevel", kort: "Gevel L" },
  { id: "gevelRechts", label: "Rechtergevel", kort: "Gevel R" },
  { id: "dakPlat", label: "Plat dak (\u2264 5\xB0)", kort: "Dak plat" },
  { id: "dakHellend", label: "Hellend dak (> 5\xB0)", kort: "Dak hellend" },
  { id: "overstek", label: "Overstek / luifel", kort: "Overstek" },
  { id: "vloer", label: "Vloer", kort: "Vloer" },
  { id: "binnen", label: "Binnenstaaf (geen windvlak)", kort: "Binnen" }
];
var BEAM_LOAD_ROLE_LABEL = Object.fromEntries(BEAM_LOAD_ROLES.map((r) => [r.id, r.label]));
function bepaalStandaardRol(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b || nodes.length === 0) return "binnen";
  const xs = nodes.map((n) => n.x), zs = nodes.map((n) => n.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-9) return "binnen";
  const helling = Math.abs(Math.atan2(Math.abs(dz), Math.abs(dx)) * 180 / Math.PI);
  const tolX = Math.max(1, (maxX - minX) * 0.02);
  const tolZ = Math.max(1, (maxZ - minZ) * 0.02);
  if (helling >= 75) {
    const xMid = (a.x + b.x) / 2;
    if (Math.abs(xMid - minX) <= tolX) return "gevelLinks";
    if (Math.abs(xMid - maxX) <= tolX) return "gevelRechts";
    return "binnen";
  }
  const opDakhoogte = Math.abs(Math.max(a.z, b.z) - maxZ) <= tolZ;
  if (opDakhoogte) return helling <= 5 ? "dakPlat" : "dakHellend";
  return helling <= 5 ? "vloer" : "binnen";
}
function rolVanStaaf(beam, nodes) {
  return beam.loadRole ?? bepaalStandaardRol(beam, nodes);
}
var PLATE_DEFAULTS = {
  thickness: 20,
  // mm
  E: 21e4,
  // N/mm²
  nu: 0.3,
  // —
  rho: 7850,
  // kg/m³
  meshSize: 500
  // mm
};
function withPlateDefaults(p) {
  return {
    ...p,
    thickness: p.thickness ?? PLATE_DEFAULTS.thickness,
    E: p.E ?? PLATE_DEFAULTS.E,
    nu: p.nu ?? PLATE_DEFAULTS.nu,
    rho: p.rho ?? PLATE_DEFAULTS.rho,
    meshSize: p.meshSize ?? PLATE_DEFAULTS.meshSize
  };
}
function isAsgelijndeRechthoek(punten, tolMm = 1) {
  if (punten.length !== 4) return false;
  const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  if (maxX - minX < tolMm || maxZ - minZ < tolMm) return false;
  const doelen = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ]
  ];
  const bezet = [false, false, false, false];
  for (const p of punten) {
    const hit = doelen.findIndex(([tx, tz], i) => !bezet[i] && Math.abs(p.x - tx) <= tolMm && Math.abs(p.z - tz) <= tolMm);
    if (hit < 0) return false;
    bezet[hit] = true;
  }
  return true;
}
function kruis(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
function segmentenSnijden(a, b, c, d) {
  const d1 = kruis(c, d, a);
  const d2 = kruis(c, d, b);
  const d3 = kruis(a, b, c);
  const d4 = kruis(a, b, d);
  if ((d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0)) {
    return true;
  }
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    const horizontaal = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
    const key = horizontaal ? "x" : "z";
    const lo1 = Math.min(a[key], b[key]), hi1 = Math.max(a[key], b[key]);
    const lo2 = Math.min(c[key], d[key]), hi2 = Math.max(c[key], d[key]);
    return Math.max(lo1, lo2) < Math.min(hi1, hi2);
  }
  return false;
}
function valideerPlaatPolygoon(punten, tolMm = 1) {
  const n = punten.length;
  if (n < 3) return "Een plaat heeft minstens drie hoeken nodig.";
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(punten[i].x - punten[j].x) <= tolMm && Math.abs(punten[i].z - punten[j].z) <= tolMm) {
        return `Hoek ${i + 1} en hoek ${j + 1} vallen (vrijwel) samen \u2014 kies verschillende hoekpunten.`;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const a = punten[i], b = punten[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = punten[j], d = punten[(j + 1) % n];
      if (segmentenSnijden(a, b, c, d)) {
        return `De omtrek snijdt zichzelf (rand ${i + 1} kruist rand ${j + 1}) \u2014 teken een enkelvoudige polygoon.`;
      }
    }
  }
  let opp2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    opp2 += punten[j].x * punten[i].z - punten[i].x * punten[j].z;
  }
  if (Math.abs(opp2) / 2 < 1e3) {
    return "De hoeken liggen (vrijwel) op \xE9\xE9n lijn \u2014 de plaat heeft geen oppervlakte.";
  }
  for (let i = 0; i < n; i++) {
    const p0 = punten[(i + n - 1) % n], p1 = punten[i], p2 = punten[(i + 1) % n];
    const cr = kruis(p1, p0, p2);
    const dot = (p0.x - p1.x) * (p2.x - p1.x) + (p0.z - p1.z) * (p2.z - p1.z);
    const l1 = Math.hypot(p0.x - p1.x, p0.z - p1.z);
    const l2 = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (l1 > 0 && l2 > 0 && Math.abs(cr) <= tolMm * Math.max(l1, l2) && dot > 0) {
      return `De rand vouwt bij hoek ${i + 1} op zichzelf terug \u2014 teken een echte omtrek.`;
    }
  }
  return null;
}
function berekenPlaatMeshSignatuur(punten, meshSizeMm) {
  return `m${meshSizeMm}|${punten.map((p) => `${p.x},${p.z}`).join(";")}`;
}
var PLAAT_RAND_NAAM_NL = {
  bottom: "onderrand",
  top: "bovenrand",
  left: "linkerrand",
  right: "rechterrand"
};
var PLAAT_RAND_NAMEN = ["bottom", "top", "left", "right"];
function bepaalPlaatRand(punten, adres, tolMm = 1) {
  const n = punten.length;
  const rechthoek = n === 4 && isAsgelijndeRechthoek(punten, tolMm);
  const soort = rechthoek ? "rechthoek" : "polygoon";
  const heeftNaam = adres.edge !== void 0;
  const heeftIndex = adres.edgeIndex !== void 0;
  if (heeftNaam && heeftIndex) {
    return {
      ok: false,
      reden: "de last noemt zowel een benoemde rand (`edge`) als een rand-index (`edgeIndex`). Geef er \xE9\xE9n: met twee adressen is niet te zeggen welke rand bedoeld is en vanaf welke hoek de posities tellen."
    };
  }
  if (!heeftNaam && !heeftIndex) {
    return {
      ok: false,
      reden: "de last noemt geen rand. Geef `edgeIndex` (rand i loopt van hoek i naar hoek i+1) of, bij een asgelijnde rechthoek, `edge`."
    };
  }
  if (n < 3) {
    return { ok: false, reden: `de plaat heeft ${n} hoeken; een rand bestaat pas vanaf drie.` };
  }
  if (heeftIndex) {
    const i = adres.edgeIndex;
    if (!Number.isInteger(i) || i < 0 || i >= n) {
      return {
        ok: false,
        reden: `rand-index ${i} bestaat niet: de plaat heeft ${n} randen (edgeIndex 0 t/m ${n - 1}).`
      };
    }
    const j = (i + 1) % n;
    const van2 = punten[i], naar2 = punten[j];
    const lengte = Math.hypot(naar2.x - van2.x, naar2.z - van2.z);
    if (!rechthoek) {
      return { ok: true, soort, hoekVan: i, hoekNaar: j, van: van2, naar: naar2, lengte, edgeIndex: i };
    }
    const xs2 = punten.map((p) => p.x), zs2 = punten.map((p) => p.z);
    const minX2 = Math.min(...xs2), maxX2 = Math.max(...xs2);
    const minZ2 = Math.min(...zs2), maxZ2 = Math.max(...zs2);
    const op = (a, b) => Math.abs(a - b) <= tolMm;
    let naam2;
    if (op(van2.z, minZ2) && op(naar2.z, minZ2)) naam2 = "bottom";
    else if (op(van2.z, maxZ2) && op(naar2.z, maxZ2)) naam2 = "top";
    else if (op(van2.x, minX2) && op(naar2.x, minX2)) naam2 = "left";
    else if (op(van2.x, maxX2) && op(naar2.x, maxX2)) naam2 = "right";
    if (!naam2) {
      return {
        ok: false,
        reden: `rand ${i + 1} (edgeIndex ${i}, hoek ${i + 1} \u2192 hoek ${j + 1}) loopt niet langs de omtrek: de hoeken van deze rechthoek staan niet in omtrekvolgorde, dus dit hoekpaar is een diagonaal. Kies de rand met een benoemde rand (\`edge\`) of teken de plaat opnieuw in omtrekvolgorde.`
      };
    }
    return { ok: true, soort, hoekVan: i, hoekNaar: j, van: van2, naar: naar2, lengte, naam: naam2, edgeIndex: i };
  }
  const naam = adres.edge;
  if (!PLAAT_RAND_NAMEN.includes(naam)) {
    return {
      ok: false,
      reden: `"${adres.edge}" is geen benoemde rand. Toegestaan: ${PLAAT_RAND_NAMEN.join(", ")}.`
    };
  }
  if (!rechthoek) {
    return {
      ok: false,
      reden: `een benoemde rand ("${PLAAT_RAND_NAAM_NL[naam]}") bestaat alleen bij een asgelijnde rechthoek; deze plaat heeft ${n} hoeken die geen asgelijnde rechthoek vormen en rekent als polygoon. Kies de rand opnieuw met een rand-index (\`edgeIndex\`: rand i loopt van hoek i naar hoek i+1).`
    };
  }
  const xs = punten.map((p) => p.x), zs = punten.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const [doelVan, doelNaar] = naam === "bottom" ? [{ x: minX, z: minZ }, { x: maxX, z: minZ }] : naam === "top" ? [{ x: minX, z: maxZ }, { x: maxX, z: maxZ }] : naam === "left" ? [{ x: minX, z: minZ }, { x: minX, z: maxZ }] : [{ x: maxX, z: minZ }, { x: maxX, z: maxZ }];
  const zoek = (d) => punten.findIndex((p) => Math.abs(p.x - d.x) <= tolMm && Math.abs(p.z - d.z) <= tolMm);
  const hoekVan = zoek(doelVan), hoekNaar = zoek(doelNaar);
  const van = punten[hoekVan], naar = punten[hoekNaar];
  return {
    ok: true,
    soort,
    hoekVan,
    hoekNaar,
    van,
    naar,
    lengte: Math.hypot(naar.x - van.x, naar.z - van.z),
    naam
  };
}
function plaatRandLabel(adres) {
  if (adres.edgeIndex !== void 0) return `rand ${adres.edgeIndex + 1}`;
  if (adres.edge !== void 0 && PLAAT_RAND_NAMEN.includes(adres.edge)) {
    return PLAAT_RAND_NAAM_NL[adres.edge];
  }
  return "rand onbekend";
}
var meshCacheCommitter = null;
function registreerPlaatMeshCacheCommitter(fn) {
  meshCacheCommitter = fn;
}
function commitPlaatMeshCache(plateId, cache) {
  meshCacheCommitter?.(plateId, cache);
}
var LOAD_SOORT_MEERVOUD = {
  lineLoad: "lijnlasten",
  pointForce: "puntlasten",
  pointMoment: "momenten",
  thermal: "temperatuurlasten",
  edgeLoad: "randlasten"
};
var GEBRUIKSCATEGORIEEN = [
  "A",
  "B",
  "C",
  "C-menigte",
  "D",
  "E",
  "F",
  "G",
  "H",
  "industrie-kort",
  "industrie-lang"
];
var ANALYSETYPEN = [
  "eersteOrde",
  "tweedeOrdeGeometrisch",
  "tweedeOrdeFysisch"
];
var ANALYSETYPE_LABEL = {
  eersteOrde: "1e orde",
  tweedeOrdeGeometrisch: "2e orde (P-\u0394)",
  tweedeOrdeFysisch: "2e orde + fysisch"
};
var ANALYSETYPE_OMSCHRIJVING = {
  eersteOrde: "Eerste orde, lineair: elke combinatie is de gewogen som van de belastinggevallen.",
  tweedeOrdeGeometrisch: "Tweede orde, geometrisch niet-lineair (P-\u0394): elke combinatie wordt met gefactoreerde lasten en geometrische stijfheid apart opgelost.",
  tweedeOrdeFysisch: "Tweede orde, geometrisch \xE9n fysisch niet-lineair: als P-\u0394, maar de betonstaven krijgen per segment de secans-EI uit de rekenkern (NEN-EN 1992-1-1 5.8.6). Zonder betonstaven m\xE9t wapeningskorf is de uitkomst gelijk aan 2e orde (P-\u0394)."
};
function analysetypeUitBestand(analysetype, nonlinearEnabled) {
  if (analysetype !== void 0 && ANALYSETYPEN.includes(analysetype)) {
    return analysetype;
  }
  return nonlinearEnabled ? "tweedeOrdeGeometrisch" : "eersteOrde";
}
function nonlinearVoorBestand(analysetype) {
  return analysetype !== "eersteOrde";
}
var DEFAULT_STRUCTURAL_GRID = {
  enabled: true,
  xAxes: [
    { id: "A", label: "A", position: 0 },
    { id: "B", label: "B", position: 12e3 }
  ],
  zAxes: [
    { id: "1", label: "1", position: 0 },
    { id: "2", label: "2", position: 5e3 }
  ]
};
var DEFAULT_VIEW = {
  scale: 1 / 25,
  offsetX: 0,
  offsetY: 0
};
var DEFAULT_GRID = {
  show: true,
  showLines: true,
  spacingMm: 500
};

// src/components/fem/solver/engine.ts
var MAX_MIXED_DOFS = 4e3;
var KNOOP_TOL_MM = 1;
var MIN_SEGMENT_MM = 25;
function normaliseerSegmenten(beamId, segmenten, L_mm) {
  if (segmenten === void 0) return void 0;
  if (!Array.isArray(segmenten) || segmenten.length === 0) {
    throw new Error(
      `Staaf ${beamId}: het veld "segmenten" is aanwezig maar leeg. Laat het weg om met \xE9\xE9n doorsnede over de volle lengte te rekenen.`
    );
  }
  const TOL = 1e-9;
  const uit = segmenten.map((s, i) => {
    const t0 = s.tStart, t1 = s.tEnd, I_mm4 = s.I;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(I_mm4)) {
      throw new Error(`Staaf ${beamId}, segment ${i + 1}: tStart, tEnd en I moeten getallen zijn.`);
    }
    if (t0 < -TOL || t1 > 1 + TOL) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: tStart/tEnd moeten tussen 0 en 1 liggen (gekregen ${t0} \u2026 ${t1}).`
      );
    }
    if (t1 - t0 <= TOL) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: tEnd (${t1}) moet groter zijn dan tStart (${t0}).`
      );
    }
    if (!(I_mm4 > 0)) {
      throw new Error(`Staaf ${beamId}, segment ${i + 1}: I moet groter dan nul zijn (mm\u2074).`);
    }
    const A_mm2 = s.A;
    if (A_mm2 !== void 0 && !(Number.isFinite(A_mm2) && A_mm2 > 0)) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: A moet, als hij is opgegeven, groter dan nul zijn (mm\xB2).`
      );
    }
    const lengte_mm = (t1 - t0) * L_mm;
    if (L_mm > 0 && lengte_mm < KNOOP_TOL_MM) {
      throw new Error(
        `Staaf ${beamId}, segment ${i + 1}: lengte ${lengte_mm.toFixed(4)} mm is korter dan de knooptolerantie van het rekenmesh (${KNOOP_TOL_MM} mm). Zo'n segment levert een element van lengte nul op. Gebruik een grovere segmentindeling.`
      );
    }
    return { t0, t1, I_mm4, ...A_mm2 !== void 0 ? { A_mm2 } : {}, index: i };
  });
  if (Math.abs(uit[0].t0) > TOL || Math.abs(uit[uit.length - 1].t1 - 1) > TOL) {
    throw new Error(
      `Staaf ${beamId}: de segmenten moeten de hele staaf dekken \u2014 het eerste segment begint bij tStart ${uit[0].t0} en het laatste eindigt bij tEnd ${uit[uit.length - 1].t1}; verwacht 0 en 1.`
    );
  }
  for (let i = 1; i < uit.length; i++) {
    if (Math.abs(uit[i].t0 - uit[i - 1].t1) > TOL) {
      throw new Error(
        `Staaf ${beamId}: segment ${i} eindigt op ${uit[i - 1].t1} en segment ${i + 1} begint op ${uit[i].t0}. De segmenten moeten aaneensluiten (geen gat en geen overlap).`
      );
    }
  }
  return uit;
}
function berekenPlaatrandSplitsFracties(nA, nB, plateRects, tolMm) {
  const ts = [];
  for (const r of plateRects) {
    for (const randZ of [r.minZ, r.minZ + r.height]) {
      if (Math.abs(nA.z - randZ) <= tolMm && Math.abs(nB.z - randZ) <= tolMm && Math.abs(nB.x - nA.x) > tolMm) {
        const lo = Math.min(nA.x, nB.x), hi = Math.max(nA.x, nB.x);
        for (let i = 0; i <= r.nx; i++) {
          const pos = r.minX + i / r.nx * r.width;
          if (pos > lo + tolMm && pos < hi - tolMm) {
            ts.push((pos - nA.x) / (nB.x - nA.x));
          }
        }
      }
    }
    for (const randX of [r.minX, r.minX + r.width]) {
      if (Math.abs(nA.x - randX) <= tolMm && Math.abs(nB.x - randX) <= tolMm && Math.abs(nB.z - nA.z) > tolMm) {
        const lo = Math.min(nA.z, nB.z), hi = Math.max(nA.z, nB.z);
        for (let j = 0; j <= r.ny; j++) {
          const pos = r.minZ + j / r.ny * r.height;
          if (pos > lo + tolMm && pos < hi - tolMm) {
            ts.push((pos - nA.z) / (nB.z - nA.z));
          }
        }
      }
    }
  }
  ts.sort((a, b) => a - b);
  const uniek = [];
  for (const t of ts) {
    if (uniek.length === 0 || Math.abs(t - uniek[uniek.length - 1]) > 1e-9) uniek.push(t);
  }
  return uniek;
}
function applySupportToMesh(mesh, meshNodeId, support) {
  const k = support.k ?? 0;
  switch (support.type) {
    case "pinned":
      mesh.updateNode(meshNodeId, { constraints: { x: true, y: true, rotation: false } });
      break;
    case "fixed":
      mesh.updateNode(meshNodeId, { constraints: { x: true, y: true, rotation: true } });
      break;
    case "xRoller":
      mesh.updateNode(meshNodeId, { constraints: { x: true, y: false, rotation: false } });
      break;
    case "zRoller":
      mesh.updateNode(meshNodeId, { constraints: { x: false, y: true, rotation: false } });
      break;
    // Veren: k ≤ 0 of ontbrekend → star (contract in types.ts) — een veer met
    // stijfheid 0 zou het DOF vrij én onverend laten en het stelsel singulier
    // maken. springY/X/Rot alleen zetten bij k > 0.
    case "zSpring":
      mesh.updateNode(meshNodeId, k > 0 ? { constraints: { x: false, y: true, rotation: false, springY: k * 1e3 } } : { constraints: { x: false, y: true, rotation: false } });
      break;
    case "xSpring":
      mesh.updateNode(meshNodeId, k > 0 ? { constraints: { x: true, y: false, rotation: false, springX: k * 1e3 } } : { constraints: { x: true, y: false, rotation: false } });
      break;
    case "rotSpring":
      mesh.updateNode(meshNodeId, k > 0 ? { constraints: { x: false, y: false, rotation: true, springRot: k / 1e3 } } : { constraints: { x: false, y: false, rotation: true } });
      break;
  }
}
function buildMesh(input, loadFactor) {
  const mesh = new Mesh();
  const nodeIdMap = /* @__PURE__ */ new Map();
  const beamIdMap = /* @__PURE__ */ new Map();
  const matTemplate = mesh.getMaterial(1);
  const materialIdByE = /* @__PURE__ */ new Map();
  const materialIdForE = (E_Nmm2) => {
    const cached = materialIdByE.get(E_Nmm2);
    if (cached !== void 0) return cached;
    const created = mesh.addMaterial({
      name: `E=${E_Nmm2} N/mm\xB2`,
      E: E_Nmm2 * 1e6,
      // N/mm² → Pa
      nu: matTemplate?.nu ?? 0.3,
      rho: matTemplate?.rho ?? 7850,
      color: matTemplate?.color ?? "#3b82f6",
      alpha: matTemplate?.alpha ?? 12e-6
    });
    materialIdByE.set(E_Nmm2, created.id);
    return created.id;
  };
  for (const n of input.nodes) {
    if (nodeIdMap.has(n.id)) {
      throw new Error(
        `Knoop ${n.id} komt tweemaal voor in het model. Elke knoop hoort een eigen nummer te hebben; anders is niet te zeggen op welke van de twee een staaf, oplegging of last aangrijpt.`
      );
    }
    const meshNode = mesh.addNode(n.x / 1e3, n.z / 1e3);
    nodeIdMap.set(n.id, meshNode.id);
  }
  for (const s of input.supports) {
    const meshNid = nodeIdMap.get(s.nodeId);
    if (meshNid === void 0) continue;
    applySupportToMesh(mesh, meshNid, s);
  }
  const nodeById = /* @__PURE__ */ new Map();
  for (const n of input.nodes) nodeById.set(n.id, { x: n.x, z: n.z });
  const TOL_MM = 1;
  const plateInputs = input.plates;
  const plateRects = [];
  const plaatPolygonen = [];
  if (plateInputs && plateInputs.length > 0) {
    for (const p of plateInputs) {
      if (!Array.isArray(p.nodeIds) || p.nodeIds.length < 3) {
        throw new Error(
          `Plaat ${p.id}: verwacht minstens 3 hoekknopen, maar kreeg er ${p.nodeIds?.length ?? 0}.`
        );
      }
      const corners = p.nodeIds.map((id) => nodeById.get(id));
      if (corners.some((c) => !c)) {
        throw new Error(`Plaat ${p.id}: \xE9\xE9n of meer hoekknopen bestaan niet meer.`);
      }
      const punten = corners.map((c) => ({ x: c.x, z: c.z }));
      const meshSize = p.meshSize > 0 ? p.meshSize : 500;
      if (punten.length === 4 && isAsgelijndeRechthoek(punten, TOL_MM)) {
        const xs = punten.map((c) => c.x);
        const zs = punten.map((c) => c.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const width = maxX - minX, height = maxZ - minZ;
        const nx = Math.max(1, Math.round(width / meshSize));
        const ny = Math.max(1, Math.round(height / meshSize));
        plateRects.push({ p, minX, minZ, width, height, nx, ny, punten });
        continue;
      }
      const vormFout = valideerPlaatPolygoon(punten, TOL_MM);
      if (vormFout) {
        throw new Error(`Plaat ${p.id}: ${vormFout}`);
      }
      const handtekening = berekenPlaatMeshSignatuur(punten, meshSize);
      const cache = p.meshCache && p.meshCache.signature === handtekening ? p.meshCache : void 0;
      if (!cache) {
        throw new Error(
          `Plaat ${p.id} is geen asgelijnde rechthoek en rekent daarom als polygonplaat, maar het CDT-rekenmesh ontbreekt of is verouderd. Open het canvas (het mesh wordt daar automatisch gegenereerd) en reken daarna opnieuw.`
        );
      }
      const beschadigd = (waarom) => {
        throw new Error(
          `Plaat ${p.id}: de meshcache is beschadigd \u2014 ${waarom}. Wijzig de plaat (bijv. de meshSize) zodat het mesh opnieuw wordt gegenereerd.`
        );
      };
      const nPts = cache.points.length;
      const driehoekenOk = Array.isArray(cache.triangles) && cache.triangles.every((t) => Array.isArray(t) && t.length === 3 && t.every((i) => Number.isInteger(i) && i >= 0 && i < nPts));
      if (!driehoekenOk || nPts < 3 || cache.triangles.length < 1) {
        beschadigd("de driehoeken verwijzen naar punten die niet bestaan");
      }
      if (!Array.isArray(cache.edgeNodeIndices)) {
        beschadigd("`edgeNodeIndices` ontbreekt");
      }
      if (cache.edgeNodeIndices.length !== punten.length) {
        beschadigd(
          `\`edgeNodeIndices\` beschrijft ${cache.edgeNodeIndices.length} randen, maar de plaat heeft ${punten.length} hoeken en dus ${punten.length} randen`
        );
      }
      cache.edgeNodeIndices.forEach((rand, i) => {
        if (!Array.isArray(rand) || rand.length < 2 || !rand.every((k) => Number.isInteger(k) && k >= 0 && k < nPts)) {
          beschadigd(`rand ${i + 1} heeft geen geldige lijst randknopen (minstens de twee hoeken)`);
        }
        const a = punten[i], b = punten[(i + 1) % punten.length];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        let tMin = Infinity, tMax = -Infinity;
        for (const k of rand) {
          const q = cache.points[k];
          const t = ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / L;
          const d = Math.abs((q.x - a.x) * (b.z - a.z) - (q.z - a.z) * (b.x - a.x)) / L;
          if (!(d <= TOL_MM) || t < -TOL_MM || t > L + TOL_MM) {
            beschadigd(`punt ${k} van rand ${i + 1} ligt niet op die rand`);
          }
          tMin = Math.min(tMin, t);
          tMax = Math.max(tMax, t);
        }
        if (tMin > TOL_MM || tMax < L - TOL_MM) {
          beschadigd(`de randknopen van rand ${i + 1} reiken niet van hoek tot hoek`);
        }
      });
      plaatPolygonen.push({ p, cache, punten });
    }
  }
  const pasReleasesToe = (meshBeamId, b, metStartzijde, metEindzijde) => {
    const rel = b.releases;
    const sTx = !!(metStartzijde && rel?.startTx);
    const sTz = !!(metStartzijde && rel?.startTz);
    const sRy = !!(metStartzijde && (rel?.startRy || b.startConnection === "hinge"));
    const eTx = !!(metEindzijde && rel?.endTx);
    const eTz = !!(metEindzijde && rel?.endTz);
    const eRy = !!(metEindzijde && (rel?.endRy || b.endConnection === "hinge"));
    const veer = b.veren;
    const kOf = (aan, los, k) => aan && !los && k !== void 0 && k > 0 ? k : void 0;
    const vSTx = kOf(metStartzijde, sTx, veer?.startTx);
    const vSTz = kOf(metStartzijde, sTz, veer?.startTz);
    const vSRy = kOf(metStartzijde, sRy, veer?.startRy);
    const vETx = kOf(metEindzijde, eTx, veer?.endTx);
    const vETz = kOf(metEindzijde, eTz, veer?.endTz);
    const vERy = kOf(metEindzijde, eRy, veer?.endRy);
    const heeftVeer = [vSTx, vSTz, vSRy, vETx, vETz, vERy].some((k) => k !== void 0);
    const updates = {};
    if (sTx || sTz || eTx || eTz || heeftVeer) {
      const soort = (los, k) => los ? "hinge" : k !== void 0 ? "spring" : "fixed";
      updates.startConnections = {
        Tx: soort(sTx, vSTx),
        Tz: soort(sTz, vSTz),
        Rz: soort(sRy, vSRy),
        ...vSTx !== void 0 ? { springTx: vSTx * 1e3 } : {},
        ...vSTz !== void 0 ? { springTz: vSTz * 1e3 } : {},
        ...vSRy !== void 0 ? { springRz: vSRy / 1e3 } : {}
      };
      updates.endConnections = {
        Tx: soort(eTx, vETx),
        Tz: soort(eTz, vETz),
        Rz: soort(eRy, vERy),
        ...vETx !== void 0 ? { springTx: vETx * 1e3 } : {},
        ...vETz !== void 0 ? { springTz: vETz * 1e3 } : {},
        ...vERy !== void 0 ? { springRz: vERy / 1e3 } : {}
      };
    } else {
      if (sRy) updates.startConnection = "hinge";
      if (eRy) updates.endConnection = "hinge";
    }
    if (Object.keys(updates).length > 0) mesh.updateBeamElement(meshBeamId, updates);
  };
  const beamSegments = /* @__PURE__ */ new Map();
  const BPL_EPS = 1e-6;
  const staafPuntlasten = input.beamPointLoads;
  const puntlastFracties = /* @__PURE__ */ new Map();
  if (staafPuntlasten) {
    for (const bpl of staafPuntlasten) {
      const t = Math.min(1, Math.max(0, bpl.posFrac ?? 0));
      if (t <= BPL_EPS || t >= 1 - BPL_EPS) continue;
      const lijst = puntlastFracties.get(bpl.beamId) ?? [];
      lijst.push(t);
      puntlastFracties.set(bpl.beamId, lijst);
    }
  }
  const extraSnedeFracties = /* @__PURE__ */ new Map();
  const voegSnedeToe = (beamId, t) => {
    const lijst = extraSnedeFracties.get(beamId) ?? [];
    lijst.push(t);
    extraSnedeFracties.set(beamId, lijst);
  };
  for (const ld of input.loads ?? []) {
    const qa = ld.qStart ?? ld.q ?? 0;
    const qb = ld.qEnd ?? ld.q ?? 0;
    if (qa === 0 && qb === 0) continue;
    const a = Math.min(1, Math.max(0, ld.startFrac ?? 0));
    const c = Math.min(1, Math.max(0, ld.endFrac ?? 1));
    if (c - a <= 0) continue;
    if (a > 0) voegSnedeToe(ld.beamId, a);
    if (c < 1) voegSnedeToe(ld.beamId, c);
  }
  for (const b of input.beams) {
    for (const t of b.extraSneden ?? []) {
      if (Number.isFinite(t)) voegSnedeToe(b.id, t);
    }
    if (b.bedding) {
      const nA = nodeById.get(b.from), nB = nodeById.get(b.to);
      if (nA && nB) {
        const L_mm = Math.hypot(nB.x - nA.x, nB.z - nA.z);
        for (const t of beddingSplitsFracties(L_mm, b.E ?? 21e4, b.I ?? 1673e4, b.bedding.kLijn)) {
          voegSnedeToe(b.id, t);
        }
      }
    }
  }
  const modelHeeftPlaten = plateRects.length > 0 || plaatPolygonen.length > 0;
  const beamKnoopPerFractie = /* @__PURE__ */ new Map();
  const segmentUitvoer = /* @__PURE__ */ new Map();
  for (const b of input.beams) {
    const fromId = nodeIdMap.get(b.from);
    const toId = nodeIdMap.get(b.to);
    if (fromId === void 0 || toId === void 0) continue;
    const section = {
      A: (b.A ?? 3877) * 1e-6,
      I: (b.I ?? 1673e4) * 1e-12,
      h: 0.2
      // default depth — only used for plate analysis
    };
    const matId = materialIdForE(b.E ?? 21e4);
    const nA = nodeById.get(b.from);
    const nB = nodeById.get(b.to);
    if (!(Math.hypot(nB.x - nA.x, nB.z - nA.z) >= 1e-7)) {
      throw new Error(
        `Staaf ${b.id} heeft lengte nul: knoop ${b.from} en knoop ${b.to} liggen op dezelfde plek (${nA.x}, ${nA.z}) mm. Zo'n staaf kan geen kracht overbrengen, en overslaan zou een krachtsverdeling geven bij een ander model dan is ingevoerd. Voeg de twee knopen samen of verwijder de staaf.`
      );
    }
    const ruweSplits = [
      ...plateRects.length > 0 ? berekenPlaatrandSplitsFracties(nA, nB, plateRects, TOL_MM) : [],
      ...puntlastFracties.get(b.id) ?? []
    ].sort((p, q) => p - q);
    const splitsT = [];
    for (const t of ruweSplits) {
      if (splitsT.length === 0 || Math.abs(t - splitsT[splitsT.length - 1]) > 1e-9) splitsT.push(t);
    }
    const L_mm = Math.hypot(nB.x - nA.x, nB.z - nA.z);
    const segDef = normaliseerSegmenten(b.id, b.segmenten, L_mm);
    if (segDef) {
      const minFrac = L_mm > 0 ? MIN_SEGMENT_MM / L_mm : Infinity;
      const dwingend = [0, ...splitsT, 1];
      for (const s of segDef.slice(1)) {
        if (dwingend.some((t) => Math.abs(t - s.t0) < minFrac)) continue;
        splitsT.push(s.t0);
      }
      splitsT.sort((p, q) => p - q);
    }
    if (!modelHeeftPlaten) {
      const minFracSnede = L_mm > 0 ? MIN_SEGMENT_MM / L_mm : Infinity;
      const kandidaten = [...extraSnedeFracties.get(b.id) ?? []].sort((p, q) => p - q);
      let iets = false;
      for (const t of kandidaten) {
        if (!(t > minFracSnede) || !(t < 1 - minFracSnede)) continue;
        if (splitsT.some((u) => Math.abs(u - t) < minFracSnede)) continue;
        const mxT = (nA.x + t * (nB.x - nA.x)) / 1e3;
        const myT = (nA.z + t * (nB.z - nA.z)) / 1e3;
        if (mesh.findNodeAt(mxT, myT, 1e-3)) continue;
        splitsT.push(t);
        iets = true;
      }
      if (iets) splitsT.sort((p, q) => p - q);
    }
    const doorsnedeVoor = (t0, t1) => {
      if (!segDef) return { sec: section, I_mm4: 0, segmentIndex: -1 };
      const mid = (t0 + t1) / 2;
      const s = segDef.find((d) => mid >= d.t0 && mid < d.t1) ?? segDef[segDef.length - 1];
      return {
        sec: {
          A: s.A_mm2 !== void 0 ? s.A_mm2 * 1e-6 : section.A,
          I: s.I_mm4 * 1e-12,
          h: section.h
        },
        I_mm4: s.I_mm4,
        ...s.A_mm2 !== void 0 ? { A_mm2: s.A_mm2 } : {},
        segmentIndex: s.index
      };
    };
    const zetBedding = (meshId) => {
      if (!b.bedding) return;
      mesh.updateBeamElement(meshId, {
        onGrade: { enabled: true, k: b.bedding.kLijn * 1e6, b: 1 }
      });
    };
    if (splitsT.length === 0) {
      const d = doorsnedeVoor(0, 1);
      const meshBeam = mesh.addBeamElement([fromId, toId], matId, d.sec);
      if (!meshBeam) continue;
      beamIdMap.set(b.id, meshBeam.id);
      pasReleasesToe(meshBeam.id, b, true, true);
      zetBedding(meshBeam.id);
      beamKnoopPerFractie.set(b.id, [
        { t: 0, meshNodeId: fromId },
        { t: 1, meshNodeId: toId }
      ]);
      if (segDef) {
        segmentUitvoer.set(
          b.id,
          [{ meshId: meshBeam.id, I_mm4: d.I_mm4, A_mm2: d.A_mm2, segmentIndex: d.segmentIndex }]
        );
      }
    } else {
      const knoopIds = [fromId];
      const grens = [0];
      for (const t of splitsT) {
        const mx = (nA.x + t * (nB.x - nA.x)) / 1e3;
        const my = (nA.z + t * (nB.z - nA.z)) / 1e3;
        const bestaand = mesh.findNodeAt(mx, my, 1e-3);
        const knoopId = bestaand ? bestaand.id : mesh.addNode(mx, my).id;
        if (knoopId === knoopIds[knoopIds.length - 1]) continue;
        knoopIds.push(knoopId);
        grens.push(t);
      }
      if (knoopIds.length > 1 && knoopIds[knoopIds.length - 1] === toId) {
        knoopIds.pop();
        grens.pop();
      }
      knoopIds.push(toId);
      grens.push(1);
      beamKnoopPerFractie.set(
        b.id,
        grens.map((t, i) => ({ t, meshNodeId: knoopIds[i] }))
      );
      const segs = [];
      const stukken = [];
      for (let i = 0; i < knoopIds.length - 1; i++) {
        const d = doorsnedeVoor(grens[i], grens[i + 1]);
        const mb = mesh.addBeamElement([knoopIds[i], knoopIds[i + 1]], matId, d.sec);
        if (!mb) continue;
        pasReleasesToe(mb.id, b, i === 0, i === knoopIds.length - 2);
        zetBedding(mb.id);
        segs.push({ meshId: mb.id, t0: grens[i], t1: grens[i + 1] });
        stukken.push({ meshId: mb.id, I_mm4: d.I_mm4, A_mm2: d.A_mm2, segmentIndex: d.segmentIndex });
      }
      if (segs.length > 0) {
        beamIdMap.set(b.id, segs[0].meshId);
        if (segs.length > 1) beamSegments.set(b.id, segs);
        if (segDef) segmentUitvoer.set(b.id, stukken);
      }
    }
  }
  const sch = input.scheefstand;
  const schFactor = sch ? sch.richting * sch.phi : 0;
  const plateInfo = [];
  const pasPlaatEigengewichtToe = (p, elementIds) => {
    if (p.selfWeightCaseId === void 0) return;
    const f = loadFactor ? loadFactor(p.selfWeightCaseId) : 1;
    if (f === 0) return;
    const gewicht = computeSelfWeightNodalForces(mesh, { elementIds });
    applyNodalForces(mesh, gewicht.map((kr) => ({
      nodeId: kr.nodeId,
      fx: (kr.fx + schFactor * -kr.fy) * f,
      fy: kr.fy * f
    })));
  };
  if (plateRects.length > 0) {
    for (const { p, minX, minZ, width, height, nx, ny, punten } of plateRects) {
      const mat = mesh.addMaterial({
        name: `Plaat ${p.id}`,
        E: p.E * 1e6,
        nu: p.nu,
        rho: p.rho,
        color: matTemplate?.color ?? "#3b82f6",
        alpha: matTemplate?.alpha ?? 12e-6
      });
      const region = generatePlateRegionMesh(mesh, {
        x: minX / 1e3,
        y: minZ / 1e3,
        // mm → m
        width: width / 1e3,
        height: height / 1e3,
        divisionsX: nx,
        divisionsY: ny,
        materialId: mat.id,
        thickness: p.thickness / 1e3,
        // mm → m
        // Regelmatig grid → Quad4: geen detJ-problemen en beter buiggedrag
        // dan CST (zie het platenplan, ontwerpbesluiten).
        elementType: "quad"
      });
      mesh.addPlateRegion(region);
      plateInfo.push({ plateId: p.id, region, hoeken: punten });
      pasPlaatEigengewichtToe(p, region.elementIds);
    }
  }
  if (plaatPolygonen.length > 0) {
    for (const { p, cache, punten } of plaatPolygonen) {
      const mat = mesh.addMaterial({
        name: `Plaat ${p.id}`,
        E: p.E * 1e6,
        nu: p.nu,
        rho: p.rho,
        color: matTemplate?.color ?? "#3b82f6",
        alpha: matTemplate?.alpha ?? 12e-6
      });
      const dikte_m = p.thickness / 1e3;
      const knoopIdPerPunt = cache.points.map((pt) => {
        const mx = pt.x / 1e3, my = pt.z / 1e3;
        const bestaand = mesh.findNodeAt(mx, my, 1e-3);
        return bestaand ? bestaand.id : mesh.addPlateNode(mx, my).id;
      });
      const nodeIds = Array.from(new Set(knoopIdPerPunt));
      const elementIds = [];
      for (const [a, b, c] of cache.triangles) {
        const t = mesh.addTriangleElement(
          [knoopIdPerPunt[a], knoopIdPerPunt[b], knoopIdPerPunt[c]],
          mat.id,
          dikte_m
        );
        if (t) elementIds.push(t.id);
      }
      const xs = cache.points.map((pt) => pt.x);
      const zs = cache.points.map((pt) => pt.z);
      const minX = Math.min(...xs), minZ = Math.min(...zs);
      const region = {
        id: 0,
        // wordt door addPlateRegion toegekend
        x: minX / 1e3,
        y: minZ / 1e3,
        width: (Math.max(...xs) - minX) / 1e3,
        height: (Math.max(...zs) - minZ) / 1e3,
        divisionsX: 0,
        divisionsY: 0,
        materialId: mat.id,
        thickness: dikte_m,
        elementType: "triangle",
        nodeIds,
        // Niet gebruikt in het adapterpad (alleen door remesh-/edge-helpers
        // van de core, die hier niet lopen) — bewust een neutrale vulling.
        cornerNodeIds: [nodeIds[0], nodeIds[0], nodeIds[0], nodeIds[0]],
        elementIds,
        // Polygonmesh heeft geen benoemde randen: randlasten lopen via de
        // rand-index (edgeNodeIds hieronder); een benoemde rand op een
        // polygonplaat wordt door `bepaalPlaatRand` geweigerd.
        edges: {
          bottom: { nodeIds: [] },
          top: { nodeIds: [] },
          left: { nodeIds: [] },
          right: { nodeIds: [] }
        },
        isPolygon: true,
        meshSize: (p.meshSize > 0 ? p.meshSize : 500) / 1e3
      };
      mesh.addPlateRegion(region);
      const edgeNodeIds = cache.edgeNodeIndices.map((rand) => rand.map((i) => knoopIdPerPunt[i]));
      plateInfo.push({ plateId: p.id, region, edgeNodeIds, hoeken: punten });
      pasPlaatEigengewichtToe(p, elementIds);
    }
  }
  const infoByPlateId = new Map(plateInfo.map((pi) => [pi.plateId, pi]));
  const randKnopenVan = (plateId, adres, wat) => {
    const info = infoByPlateId.get(plateId);
    if (!info) {
      throw new Error(
        `Plaat ${plateId} staat niet in het model, maar ${wat} verwijst ernaar. Een last zonder plaat overslaan zou een berekening geven zonder die last.`
      );
    }
    const rand = bepaalPlaatRand(info.hoeken, adres, TOL_MM);
    if (!rand.ok) throw new Error(`Plaat ${plateId}: ${wat} \u2014 ${rand.reden}`);
    const kandidaten = rand.soort === "rechthoek" ? info.region.edges[rand.naam].nodeIds : info.edgeNodeIds[rand.edgeIndex];
    const ax = rand.van.x / 1e3, az = rand.van.z / 1e3;
    const L = rand.lengte / 1e3;
    const ex = (rand.naar.x - rand.van.x) / rand.lengte;
    const ez = (rand.naar.z - rand.van.z) / rand.lengte;
    const rij = [...new Set(kandidaten)].map((nid) => {
      const nd = mesh.getNode(nid);
      return { nid, s: nd ? (nd.x - ax) * ex + (nd.y - az) * ez : NaN };
    });
    if (rij.length < 2 || rij.some((r) => !Number.isFinite(r.s))) {
      throw new Error(
        `Plaat ${plateId}: ${wat} \u2014 de rand heeft geen bruikbare rekenknopen (het rekenmesh is onvolledig). Wijzig de plaat zodat het mesh opnieuw wordt gemaakt.`
      );
    }
    rij.sort((a, b) => a.s - b.s);
    return { nodeIds: rij.map((r) => r.nid), s: rij.map((r) => r.s), L };
  };
  const randKoppelingen = [];
  if (plateInfo.length > 0) {
    const uiIdVan = /* @__PURE__ */ new Map();
    for (const [uiId, meshId] of nodeIdMap) uiIdVan.set(meshId, uiId);
    const knoopNaam = (meshId) => {
      const ui = uiIdVan.get(meshId);
      if (ui !== void 0) return `knoop ${ui}`;
      const nd = mesh.getNode(meshId);
      return nd ? `de rekenknoop op (${Math.round(nd.x * 1e4) / 10}, ${Math.round(nd.y * 1e4) / 10}) mm` : `rekenknoop ${meshId}`;
    };
    const plaatKnopen = /* @__PURE__ */ new Set();
    for (const el of mesh.elements.values()) for (const nid of el.nodeIds) plaatKnopen.add(nid);
    const rijen = [];
    for (const info of plateInfo) {
      const adressen = info.edgeNodeIds ? info.hoeken.map((_, i) => ({ edgeIndex: i })) : ["bottom", "top", "left", "right"].map((edge) => ({ edge }));
      for (const adres of adressen) {
        rijen.push({ plateId: info.plateId, nodeIds: randKnopenVan(info.plateId, adres, "een plaatrand").nodeIds });
      }
    }
    const staafKnopen = /* @__PURE__ */ new Set();
    for (const be of mesh.beamElements.values()) for (const nid of be.nodeIds) staafKnopen.add(nid);
    const TOL_M = TOL_MM / 1e3;
    for (const nid of staafKnopen) {
      if (plaatKnopen.has(nid)) continue;
      const nd = mesh.getNode(nid);
      if (!nd) continue;
      const perPlaat = /* @__PURE__ */ new Map();
      for (const rij of rijen) {
        for (let j = 0; j + 1 < rij.nodeIds.length; j++) {
          const na = mesh.getNode(rij.nodeIds[j]);
          const nb = mesh.getNode(rij.nodeIds[j + 1]);
          if (!na || !nb) continue;
          const dx = nb.x - na.x, dy = nb.y - na.y;
          const l2 = dx * dx + dy * dy;
          if (!(l2 > 0)) continue;
          const t = ((nd.x - na.x) * dx + (nd.y - na.y) * dy) / l2;
          if (t < 0 || t > 1) continue;
          const d = Math.abs((nd.x - na.x) * dy - (nd.y - na.y) * dx) / Math.sqrt(l2);
          if (d > TOL_M) continue;
          const oud = perPlaat.get(rij.plateId);
          if (!oud || d < oud.d) perPlaat.set(rij.plateId, { a: na.id, b: nb.id, t, d });
        }
      }
      if (perPlaat.size === 0) continue;
      const [[eerstePlaat, k0], ...rest] = [...perPlaat.entries()];
      for (const [pid, k] of rest) {
        const zelfde = k.a === k0.a && k.b === k0.b && Math.abs(k.t - k0.t) < 1e-9 || k.a === k0.b && k.b === k0.a && Math.abs(k.t - (1 - k0.t)) < 1e-9;
        if (!zelfde) {
          throw new Error(
            `Plaat ${eerstePlaat} en plaat ${pid}: ${knoopNaam(nid)} ligt op de rand van beide platen, maar tussen verschillende rekenknopen van die randen. Aan welke rand de staaf dan hangt, is niet eenduidig. Geef beide platen langs die rand dezelfde rekenknopen (gelijke meshSize en ligging), of laat de staaf op een hoek of rekenknoop aansluiten.`
          );
        }
      }
      const c = nd.constraints;
      if (c.x && c.springX == null || c.y && c.springY == null) {
        throw new Error(
          `Plaat ${eerstePlaat}: de oplegging op ${knoopNaam(nid)} staat op een staafknoop die tussen twee rekenknopen op de plaatrand ligt. Zo'n knoop wordt kinematisch aan die rand gekoppeld (lineaire interpolatie tussen de twee randknopen); een starre oplegging in x of z erop is dan niet eenduidig te verwerken. Zet de oplegging op een hoek of rekenknoop van de plaat, of kies de meshSize zodat deze knoop een rekenknoop wordt.`
        );
      }
      randKoppelingen.push({
        slaafKnoopId: nid,
        meesters: [{ knoopId: k0.a, gewicht: 1 - k0.t }, { knoopId: k0.b, gewicht: k0.t }]
      });
    }
  }
  if (plateInfo.length > 0) {
    const actieveKnopen = buildNodeIdToIndex(mesh, "mixed_beam_plate");
    const nDof = actieveKnopen.size * 3;
    if (nDof > MAX_MIXED_DOFS) {
      throw new Error(
        `Model te groot voor de ingebouwde solver: ${nDof} vrijheidsgraden (maximum \xB1${MAX_MIXED_DOFS}). Vergroot de meshSize van de platen of verklein het model.`
      );
    }
    for (const s of input.supports) {
      const mid = nodeIdMap.get(s.nodeId);
      if (mid !== void 0 && !actieveKnopen.has(mid)) {
        throw new Error(
          `Steunpunt op knoop ${s.nodeId} ligt niet op een rekenknoop van het plaatmesh. Verplaats de knoop naar een gridpositie van de plaat (veelvoud van de meshSize vanaf een hoek) of pas de meshSize aan.`
        );
      }
    }
    const plsValidatie = input.pointLoads;
    if (plsValidatie) {
      for (const pl of plsValidatie) {
        const mid = nodeIdMap.get(pl.nodeId);
        if (mid !== void 0 && !actieveKnopen.has(mid)) {
          throw new Error(
            `Puntlast op knoop ${pl.nodeId} ligt niet op een rekenknoop van het plaatmesh. Verplaats de knoop naar een gridpositie van de plaat of pas de meshSize aan.`
          );
        }
      }
    }
  }
  const beamAngle = /* @__PURE__ */ new Map();
  for (const b of input.beams) {
    const nf = nodeById.get(b.from), nt = nodeById.get(b.to);
    if (nf && nt) beamAngle.set(b.id, Math.atan2(nt.z - nf.z, nt.x - nf.x));
  }
  const pasVerdeeldeLastToe = (meshBeamId, qxA, qyA, qxB, qyB, aFrac, bFrac) => {
    const isPartial = aFrac > 0 || bFrac < 1;
    const beam = mesh.getBeamElement(meshBeamId);
    if (!isPartial) {
      const ex = beam?.distributedLoad;
      mesh.updateBeamElement(meshBeamId, {
        distributedLoad: {
          qx: (ex?.qx ?? 0) + qxA,
          qy: (ex?.qy ?? 0) + qyA,
          qxEnd: (ex?.qxEnd ?? ex?.qx ?? 0) + qxB,
          qyEnd: (ex?.qyEnd ?? ex?.qy ?? 0) + qyB,
          coordSystem: "global"
        }
      });
    } else {
      if (bFrac - aFrac <= 0) return;
      const arr = beam?.distributedLoads ?? [];
      mesh.updateBeamElement(meshBeamId, {
        distributedLoads: [...arr, {
          qx: qxA,
          qy: qyA,
          qxEnd: qxB,
          qyEnd: qyB,
          startT: aFrac,
          endT: bFrac,
          coordSystem: "global"
        }]
      });
    }
  };
  const loads = input.loads;
  if (loads) {
    for (const ld of loads) {
      const f = loadFactor ? loadFactor(ld.caseId) : 1;
      if (f === 0) continue;
      const beamMeshId = beamIdMap.get(ld.beamId);
      if (beamMeshId === void 0) continue;
      const qa = (ld.qStart ?? ld.q ?? 0) * 1e3 * f;
      const qb = (ld.qEnd ?? ld.q ?? 0) * 1e3 * f;
      const dir = ld.qDir ?? "z";
      const coord = ld.qCoord ?? "global";
      let gxA, gyA, gxB, gyB;
      if (coord === "local") {
        const th = beamAngle.get(ld.beamId) ?? 0;
        const c = Math.cos(th), s = Math.sin(th);
        const ax = dir === "x" ? 1 : 0;
        const tr = dir === "z" ? 1 : 0;
        gxA = qa * (ax * c - tr * s);
        gyA = qa * (ax * s + tr * c);
        gxB = qb * (ax * c - tr * s);
        gyB = qb * (ax * s + tr * c);
      } else {
        gxA = dir === "x" ? qa : 0;
        gyA = dir === "z" ? qa : 0;
        gxB = dir === "x" ? qb : 0;
        gyB = dir === "z" ? qb : 0;
      }
      const qxA = gxA + schFactor * -gyA;
      const qyA = gyA;
      const qxB = gxB + schFactor * -gyB;
      const qyB = gyB;
      const aFrac = Math.min(1, Math.max(0, ld.startFrac ?? 0));
      const bFrac = Math.min(1, Math.max(0, ld.endFrac ?? 1));
      const segs = beamSegments.get(ld.beamId);
      if (!segs) {
        pasVerdeeldeLastToe(beamMeshId, qxA, qyA, qxB, qyB, aFrac, bFrac);
      } else {
        for (const s of segs) {
          const lo = Math.max(aFrac, s.t0);
          const hi = Math.min(bFrac, s.t1);
          if (hi - lo <= 1e-12) continue;
          const frac = (t) => bFrac === aFrac ? 0 : (t - aFrac) / (bFrac - aFrac);
          const fLo = frac(lo), fHi = frac(hi);
          let segA = (lo - s.t0) / (s.t1 - s.t0);
          let segB = (hi - s.t0) / (s.t1 - s.t0);
          if (segA < 1e-9) segA = 0;
          if (segB > 1 - 1e-9) segB = 1;
          pasVerdeeldeLastToe(
            s.meshId,
            qxA + (qxB - qxA) * fLo,
            qyA + (qyB - qyA) * fLo,
            qxA + (qxB - qxA) * fHi,
            qyA + (qyB - qyA) * fHi,
            segA,
            segB
          );
        }
      }
    }
  }
  const edgeLds = input.edgeLoads ?? [];
  const zetRandkrachten = (krachten) => {
    applyNodalForces(mesh, krachten.map((kr) => ({
      nodeId: kr.nodeId,
      fx: kr.fx + schFactor * -kr.fy,
      fy: kr.fy
    })));
  };
  for (const el of edgeLds) {
    const rand = randKnopenVan(el.plateId, el, "een randlast");
    const a = el.startFrac ?? 0;
    const b = el.endFrac ?? 1;
    if (!(Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= 1 && a < b)) {
      throw new Error(
        `Plaat ${el.plateId}: een randlast heeft een belast deel dat niet binnen de rand ligt of niet v\xF3\xF3r zijn einde begint (startFrac ${a}, endFrac ${b}). Geef 0 \u2264 startFrac < endFrac \u2264 1, gemeten vanaf de beginhoek van de rand.`
      );
    }
    const f = loadFactor ? loadFactor(el.caseId) : 1;
    if (f === 0) continue;
    const pA = el.pStart ?? el.p ?? 0;
    const pB = el.pEnd ?? el.p ?? 0;
    if (pA === 0 && pB === 0) continue;
    const dir = el.dir ?? "z";
    if (a === 0 && b === 1 && pA === pB) {
      const p_Nm = pA * 1e3 * f;
      zetRandkrachten(computeEdgeLoadNodalForces(
        mesh,
        rand.nodeIds,
        dir === "x" ? p_Nm : 0,
        dir === "z" ? p_Nm : 0
      ));
      continue;
    }
    const qa = pA * 1e3 * f, qb = pB * 1e3 * f;
    zetRandkrachten(verdeelRandlastConsistent(
      rand.nodeIds,
      rand.s,
      a * rand.L,
      b * rand.L,
      dir === "x" ? qa : 0,
      dir === "z" ? qa : 0,
      dir === "x" ? qb : 0,
      dir === "z" ? qb : 0
    ));
  }
  const randPls = input.edgePointLoads ?? [];
  for (const pl of randPls) {
    const rand = randKnopenVan(pl.plateId, pl, "een puntlast op de plaatrand");
    const t = pl.posFrac;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
      throw new Error(
        `Plaat ${pl.plateId}: een puntlast op de plaatrand heeft ` + (t === void 0 ? "geen positie" : `een positie buiten de rand (posFrac ${t})`) + ". Geef posFrac als fractie 0 \u2026 1 langs de rand, gemeten vanaf de beginhoek."
      );
    }
    const f = loadFactor ? loadFactor(pl.caseId) : 1;
    if (f === 0) continue;
    const fx = (pl.fx ?? 0) * f, fz = (pl.fz ?? 0) * f;
    if (fx === 0 && fz === 0) continue;
    zetRandkrachten(verdeelRandpuntlastConsistent(rand.nodeIds, rand.s, t * rand.L, fx, fz));
  }
  const pasKnooplastToe = (meshNid, fx_N, fz_N, my_Nmm, f) => {
    const node = mesh.getNode(meshNid);
    const ex = node?.loads ?? { fx: 0, fy: 0, moment: 0 };
    mesh.updateNode(meshNid, {
      loads: {
        // Scheefstand-companion: fx += φ·(−fz)·richting (fz < 0 = omlaag).
        fx: ex.fx + (fx_N + schFactor * -fz_N) * f,
        fy: ex.fy + fz_N * f,
        // my in N·mm → mesh moment in N·m  → /1000
        moment: ex.moment + my_Nmm / 1e3 * f
      }
    });
  };
  const pls = input.pointLoads;
  if (pls) {
    for (const pl of pls) {
      const f = loadFactor ? loadFactor(pl.caseId) : 1;
      if (f === 0) continue;
      const meshNid = nodeIdMap.get(pl.nodeId);
      if (meshNid === void 0) continue;
      pasKnooplastToe(meshNid, pl.fx ?? 0, pl.fz ?? 0, pl.my ?? 0, f);
    }
  }
  if (staafPuntlasten) {
    for (const bpl of staafPuntlasten) {
      const f = loadFactor ? loadFactor(bpl.caseId) : 1;
      if (f === 0) continue;
      const knopen = beamKnoopPerFractie.get(bpl.beamId);
      if (!knopen || knopen.length === 0) continue;
      const t = Math.min(1, Math.max(0, bpl.posFrac ?? 0));
      let beste = knopen[0];
      for (const k of knopen) {
        if (Math.abs(k.t - t) < Math.abs(beste.t - t)) beste = k;
      }
      pasKnooplastToe(beste.meshNodeId, bpl.fx ?? 0, bpl.fz ?? 0, bpl.my ?? 0, f);
    }
  }
  const tls = input.thermalLoads;
  if (tls) {
    for (const tl of tls) {
      const f = loadFactor ? loadFactor(tl.caseId) : 1;
      if (f === 0 || !tl.deltaT) continue;
      const beamMeshId = beamIdMap.get(tl.beamId);
      if (beamMeshId === void 0) continue;
      const doelIds = beamSegments.get(tl.beamId)?.map((s) => s.meshId) ?? [beamMeshId];
      for (const doelId of doelIds) {
        const beam = mesh.getBeamElement(doelId);
        if (!beam) continue;
        const alphaMat = mesh.getMaterial(beam.materialId)?.alpha ?? 12e-6;
        const alphaLoad = tl.alpha ?? 12e-6;
        const ex = beam.thermalLoad?.deltaT ?? 0;
        mesh.updateBeamElement(doelId, {
          thermalLoad: { deltaT: ex + tl.deltaT * (alphaLoad / alphaMat) * f }
        });
      }
    }
  }
  return { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen };
}
function convertResult(mesh, engineResult, nodeIdMap, beamIdMap, supports, plateInfo, nodeIndex, beamSegments, segmentUitvoer) {
  const displacements = /* @__PURE__ */ new Map();
  const reactions = /* @__PURE__ */ new Map();
  const elements = /* @__PURE__ */ new Map();
  let indexById;
  if (nodeIndex) {
    indexById = nodeIndex;
  } else {
    const meshNodes = Array.from(mesh.nodes.values());
    indexById = /* @__PURE__ */ new Map();
    meshNodes.forEach((n, i) => indexById.set(n.id, i));
  }
  let maxDisp = 0;
  for (const [uiId, meshId] of nodeIdMap) {
    const idx = indexById.get(meshId);
    if (idx === void 0) continue;
    const base = idx * 3;
    const ux_m = engineResult.displacements[base + 0] ?? 0;
    const uz_m = engineResult.displacements[base + 1] ?? 0;
    const ry = engineResult.displacements[base + 2] ?? 0;
    const ux = ux_m * 1e3, uz = uz_m * 1e3;
    displacements.set(uiId, { ux, uz, ry });
    maxDisp = Math.max(maxDisp, Math.abs(ux), Math.abs(uz));
    const support = supports.find((s) => s.nodeId === uiId);
    if (support) {
      let fx = engineResult.reactions[base + 0] ?? 0;
      let fz = engineResult.reactions[base + 1] ?? 0;
      let my_Nmm = (engineResult.reactions[base + 2] ?? 0) * 1e3;
      const k = support.k ?? 0;
      if (k > 0) {
        if (support.type === "zSpring") fz = -k * uz;
        if (support.type === "xSpring") fx = -k * ux;
        if (support.type === "rotSpring") my_Nmm = -k * ry;
      }
      reactions.set(uiId, { fx, fz, my: my_Nmm });
    }
  }
  const bouwSegmentUitvoer = (stukken) => {
    const uit = [];
    let offset_m = 0;
    for (const stuk of stukken) {
      const d = engineResult.beamForces.get(stuk.meshId);
      if (!d) return void 0;
      const st = d.stations ?? [];
      const L_stuk_m = st.length > 0 ? st[st.length - 1] : 0;
      const nArr = d.normalForce ?? [];
      const mArr = d.bendingMoment ?? [];
      let iMax = 0;
      for (let i = 1; i < mArr.length; i++) {
        if (Math.abs(mArr[i]) > Math.abs(mArr[iMax])) iMax = i;
      }
      const laatste = Math.max(0, mArr.length - 1);
      uit.push({
        xStart: offset_m * 1e3,
        xEnd: (offset_m + L_stuk_m) * 1e3,
        I: stuk.I_mm4,
        ...stuk.A_mm2 !== void 0 ? { A: stuk.A_mm2 } : {},
        segmentIndex: stuk.segmentIndex,
        N_start: -(nArr[0] ?? 0),
        N_end: -(nArr[nArr.length - 1] ?? 0),
        M_start: (mArr[0] ?? 0) * 1e3,
        M_end: (mArr[laatste] ?? 0) * 1e3,
        M_max: (mArr[iMax] ?? 0) * 1e3,
        N_bij_M_max: -(nArr[iMax] ?? 0)
      });
      offset_m += L_stuk_m;
    }
    return uit;
  };
  for (const [uiId, meshId] of beamIdMap) {
    const stukken = segmentUitvoer?.get(uiId);
    const segmentVeld = stukken ? bouwSegmentUitvoer(stukken) : void 0;
    const segs = beamSegments?.get(uiId);
    if (segs && segs.length > 1) {
      const delen = segs.map((s) => engineResult.beamForces.get(s.meshId));
      if (delen.some((d) => !d)) continue;
      const stations_mm = [];
      const normalForce = [];
      const shearForce = [];
      const bendingMoment = [];
      const deflection = [];
      const axialDisp = [];
      const rotation = [];
      let offset_m = 0;
      for (const d of delen) {
        const st = d.stations ?? [];
        for (let i = 0; i < st.length; i++) {
          stations_mm.push((st[i] + offset_m) * 1e3);
          normalForce.push(-(d.normalForce?.[i] ?? 0));
          shearForce.push(d.shearForce?.[i] ?? 0);
          bendingMoment.push((d.bendingMoment?.[i] ?? 0) * 1e3);
          deflection.push((d.deflection?.[i] ?? 0) * 1e3);
          axialDisp.push((d.axialDisp?.[i] ?? 0) * 1e3);
          rotation.push(d.rotation?.[i] ?? 0);
        }
        offset_m += st.length > 0 ? st[st.length - 1] : 0;
      }
      const eerste = delen[0], laatste = delen[delen.length - 1];
      elements.set(uiId, {
        N: -eerste.N1,
        V: eerste.V1,
        M_start: eerste.M1 * 1e3,
        M_end: laatste.M2 * 1e3,
        L_mm: offset_m * 1e3,
        stations_mm,
        normalForce,
        shearForce,
        bendingMoment,
        deflection,
        axialDisp,
        rotation,
        ...segmentVeld ? { segmenten: segmentVeld } : {}
      });
      continue;
    }
    const bf = engineResult.beamForces.get(meshId);
    if (!bf) continue;
    const stations_m = bf.stations ?? [];
    const L_m = stations_m.length > 0 ? stations_m[stations_m.length - 1] : 0;
    elements.set(uiId, {
      // TEKENCONVENTIE N: de core levert druk-positief (f_local = K·d aan het
      // startpunt). De hele UI/rapport/toetsing hanteert de constructeurs-
      // conventie TREK POSITIEF (EN-contract n_ed idem), dus hier — op de ene
      // adapter-grens — wordt geflipt. Richting-onafhankelijk geverifieerd
      // (kolom from=onder én from=boven geven dezelfde druk): zie
      // test-n-teken.mjs.
      N: -bf.N1,
      V: bf.V1,
      M_start: bf.M1 * 1e3,
      // N·m → N·mm
      M_end: bf.M2 * 1e3,
      L_mm: L_m * 1e3,
      stations_mm: stations_m.map((x) => x * 1e3),
      normalForce: (bf.normalForce ?? []).map((n) => -n),
      shearForce: bf.shearForce ?? [],
      bendingMoment: (bf.bendingMoment ?? []).map((m) => m * 1e3),
      // N·m → N·mm
      deflection: (bf.deflection ?? []).map((w) => w * 1e3),
      // m → mm (lokaal, +y)
      axialDisp: (bf.axialDisp ?? []).map((u) => u * 1e3),
      // m → mm
      // θ = dw/dx is dimensieloos (rad): dezelfde waarde in m-assen en in
      // mm-assen, dus onveranderd doorgegeven.
      rotation: bf.rotation ?? [],
      ...segmentVeld ? { segmenten: segmentVeld } : {}
    });
  }
  let plateResults;
  if (plateInfo && plateInfo.length > 0) {
    plateResults = [];
    for (const info of plateInfo) {
      for (const nid of info.region.nodeIds) {
        const idx = indexById.get(nid);
        if (idx === void 0) continue;
        const base = idx * 3;
        const ux = (engineResult.displacements[base + 0] ?? 0) * 1e3;
        const uz = (engineResult.displacements[base + 1] ?? 0) * 1e3;
        maxDisp = Math.max(maxDisp, Math.abs(ux), Math.abs(uz));
      }
      const mkRange = () => ({ min: Infinity, max: -Infinity });
      const ranges = {
        sigmaX: mkRange(),
        sigmaY: mkRange(),
        tauXY: mkRange(),
        vonMises: mkRange(),
        nx: mkRange(),
        ny: mkRange(),
        nxy: mkRange()
      };
      const bijwerken = (r, v) => {
        r.min = Math.min(r.min, v);
        r.max = Math.max(r.max, v);
      };
      const plaatElementen = [];
      for (const eid of info.region.elementIds) {
        const st = engineResult.elementStresses?.get(eid);
        const el = mesh.getElement(eid);
        if (!st || !el) continue;
        const corners = el.nodeIds.map((nid) => mesh.getNode(nid)).filter((n) => !!n).map((n) => ({ x: n.x * 1e3, z: n.y * 1e3 }));
        const item = {
          elementId: eid,
          corners,
          sigmaX: st.sigmaX / 1e6,
          sigmaY: st.sigmaY / 1e6,
          tauXY: st.tauXY / 1e6,
          vonMises: st.vonMises / 1e6,
          sigma1: (st.principalStresses?.sigma1 ?? 0) / 1e6,
          sigma2: (st.principalStresses?.sigma2 ?? 0) / 1e6,
          angle: st.principalStresses?.angle ?? 0,
          nx: (st.nx ?? 0) / 1e3,
          ny: (st.ny ?? 0) / 1e3,
          nxy: (st.nxy ?? 0) / 1e3
        };
        plaatElementen.push(item);
        bijwerken(ranges.sigmaX, item.sigmaX);
        bijwerken(ranges.sigmaY, item.sigmaY);
        bijwerken(ranges.tauXY, item.tauXY);
        bijwerken(ranges.vonMises, item.vonMises);
        bijwerken(ranges.nx, item.nx);
        bijwerken(ranges.ny, item.ny);
        bijwerken(ranges.nxy, item.nxy);
      }
      for (const r of Object.values(ranges)) {
        if (!Number.isFinite(r.min)) {
          r.min = 0;
          r.max = 0;
        }
      }
      plateResults.push({ plateId: info.plateId, elements: plaatElementen, ranges });
    }
  }
  return {
    displacements,
    reactions,
    elements,
    maxDisplacement: maxDisp,
    ...plateResults ? { plateElements: plateResults } : {}
  };
}
function beddingSplitsFracties(L_mm, E_nmm2, I_mm4, kLijn) {
  if (!(L_mm > 0) || !(kLijn > 0) || !(E_nmm2 > 0) || !(I_mm4 > 0)) return [];
  const lambda = Math.pow(kLijn / (4 * E_nmm2 * I_mm4), 0.25);
  const maxLengte = 0.15 / lambda;
  const n = Math.min(200, Math.max(8, Math.ceil(L_mm / maxLengte)));
  const uit = [];
  for (let i = 1; i < n; i++) uit.push(i / n);
  return uit;
}
var actieveLogOpvanger;
function zetSolverLogOpvanger(f) {
  actieveLogOpvanger = f;
}
function logMet(voorvoegsel) {
  const opvanger = actieveLogOpvanger;
  if (!opvanger) return void 0;
  return (r) => opvanger({ ...r, tekst: `[${voorvoegsel}] ${r.tekst}` });
}
function metKnoopnummer(e, nodeIdMap, plateInfo = []) {
  if (e instanceof PlaatElementFout) {
    const plaat = plateInfo.find((pi) => pi.region.elementIds.includes(e.meshElementId));
    return new Error(plaat ? `Plaat ${plaat.plateId}: ${e.message}` : e.message);
  }
  if (!(e instanceof SingulierStelselFout)) return e;
  for (const [uiId, meshId] of nodeIdMap) {
    if (meshId === e.meshKnoopId) return new Error(e.tekstVoor(`knoop ${uiId}`));
  }
  return new Error(e.message);
}
function eisEindigeUitkomst(r, wat) {
  const stop = (waar) => {
    throw new Error(
      `De berekening leverde een ongeldig getal (NaN of oneindig) op${wat} bij ${waar}. Dat resultaat wordt niet getoond of getoetst. Meestal zit er een rekenelement van (bijna) lengte nul in het model \u2014 twee knopen of een puntlast vlak naast elkaar \u2014 of een staaf zonder stijfheid.`
    );
  };
  const eindig = (v) => v === void 0 || Number.isFinite(v);
  for (const [id, d] of r.displacements) {
    if (!eindig(d.ux) || !eindig(d.uz) || !eindig(d.ry)) stop(`de verplaatsing van knoop ${id}`);
  }
  for (const [id, re] of r.reactions) {
    if (!eindig(re.fx) || !eindig(re.fz) || !eindig(re.my)) stop(`de oplegreactie van knoop ${id}`);
  }
  for (const [id, ef] of r.elements) {
    if (!eindig(ef.N) || !eindig(ef.V) || !eindig(ef.M_start) || !eindig(ef.M_end)) {
      stop(`de staafkrachten van staaf ${id}`);
    }
    const lijnen = [
      ["de momentenlijn", ef.bendingMoment],
      ["de dwarskrachtenlijn", ef.shearForce],
      ["de normaalkrachtenlijn", ef.normalForce],
      ["de doorbuigingslijn", ef.deflection]
    ];
    for (const [naam, lijn] of lijnen) {
      if (lijn?.some((v) => !Number.isFinite(v))) stop(`${naam} van staaf ${id}`);
    }
  }
  return r;
}
function solve(input) {
  const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen } = buildMesh(input);
  const heeftPlaten = plateInfo.length > 0;
  let engineResult;
  try {
    engineResult = solveNonlinear(mesh, {
      analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
      geometricNonlinear: false,
      randKoppelingen
    });
  } catch (e) {
    throw metKnoopnummer(e, nodeIdMap, plateInfo);
  }
  const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : void 0;
  return eisEindigeUitkomst(
    convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments, segmentUitvoer),
    ""
  );
}
var SCHEEFSTAND_ID_OFFSET = 1e6;
var SCHEEFSTAND_KEY = "__femScheefstandRichtingen";
function getScheefstandRichtingen(perCase) {
  return perCase[SCHEEFSTAND_KEY];
}
function gevalResultaten(perCase) {
  const sr = getScheefstandRichtingen(perCase);
  if (!sr) return perCase;
  return new Map([...perCase].filter(([id]) => id < sr.offset));
}
function losGevallenOp(input, perCase, idOffset) {
  for (const c of input.cases) {
    const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen } = buildMesh(input, (caseId) => caseId === c.id ? 1 : 0);
    if (!meshHeeftLasten(mesh)) continue;
    const heeftPlaten = plateInfo.length > 0;
    let engineResult;
    try {
      engineResult = solveNonlinear(mesh, {
        analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
        geometricNonlinear: false,
        onLog: logMet(c.name),
        randKoppelingen
      });
    } catch (e) {
      throw metKnoopnummer(e, nodeIdMap, plateInfo);
    }
    const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : void 0;
    perCase.set(c.id + idOffset, eisEindigeUitkomst(
      convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments, segmentUitvoer),
      ` in belastinggeval "${c.name}"`
    ));
  }
}
function solveAllCases(input) {
  const perCase = /* @__PURE__ */ new Map();
  losGevallenOp(input, perCase, 0);
  if (input.scheefstand) {
    const tegen2 = {
      ...input,
      scheefstand: { ...input.scheefstand, richting: -input.scheefstand.richting }
    };
    losGevallenOp(tegen2, perCase, SCHEEFSTAND_ID_OFFSET);
    const sr = { primair: input.scheefstand.richting, offset: SCHEEFSTAND_ID_OFFSET };
    perCase[SCHEEFSTAND_KEY] = sr;
  }
  return { perCase };
}
function meshHeeftLasten(mesh) {
  for (const node of mesh.nodes.values()) {
    const l = node.loads;
    if (l && (l.fx !== 0 || l.fy !== 0 || (l.moment ?? 0) !== 0)) return true;
  }
  for (const beam of mesh.beamElements.values()) {
    const d = beam.distributedLoad;
    if (d && (d.qx !== 0 || d.qy !== 0 || (d.qxEnd ?? 0) !== 0 || (d.qyEnd ?? 0) !== 0)) return true;
    const dArr = beam.distributedLoads;
    if (dArr && dArr.some((p) => p.qx !== 0 || p.qy !== 0 || (p.qxEnd ?? 0) !== 0 || (p.qyEnd ?? 0) !== 0)) return true;
    const t = beam.thermalLoad;
    if (t && ((t.deltaT ?? 0) !== 0 || t.deltaTTop !== void 0 || t.deltaTBottom !== void 0)) return true;
  }
  return false;
}
var SECOND_ORDER_KEY = "__femSecondOrder";
function getSecondOrderState(perCase) {
  return perCase[SECOND_ORDER_KEY];
}
function tweedeOrdeSleutel(combo) {
  return `${combo.id}|` + [...combo.factors.entries()].sort((a, b) => a[0] - b[0]).map(([cid, f]) => `${cid}=${f}`).join(",");
}
function zetCombinatieResultaat(perCase, combo, resultaat) {
  const so = getSecondOrderState(perCase);
  if (!so) return false;
  so.cache.set(tweedeOrdeSleutel(combo), resultaat);
  return true;
}
function getSecondOrderInput(perCase) {
  return getSecondOrderState(perCase)?.input;
}
function solveCombinationSecondOrder(input, combo) {
  const invoer = input.scheefstand && combo.scheefstandRichting !== void 0 && combo.scheefstandRichting !== input.scheefstand.richting ? { ...input, scheefstand: { ...input.scheefstand, richting: combo.scheefstandRichting } } : input;
  const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments, segmentUitvoer, randKoppelingen } = buildMesh(
    invoer,
    (caseId) => combo.factors.get(caseId ?? -1) ?? 0
  );
  if (!meshHeeftLasten(mesh)) return null;
  const heeftPlaten = plateInfo.length > 0;
  try {
    const engineResult = solveNonlinear(mesh, {
      analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
      geometricNonlinear: true,
      randKoppelingen,
      // Geïtereerde P-Δ convergeert met ratio ≈ P/P_kr per iteratie; 100
      // iteraties dekt tot P ≈ 0.87·P_kr bij tol 1e-6. Daarboven → nette fout.
      maxIterations: 100,
      tolerance: 1e-6,
      // De combinatienaam erbij. Juist hier telt dat: divergeert er één
      // combinatie, dan is het log het enige wat vertelt wélke.
      onLog: logMet(combo.name)
    });
    const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : void 0;
    return eisEindigeUitkomst(
      convertResult(
        mesh,
        engineResult,
        nodeIdMap,
        beamIdMap,
        invoer.supports,
        heeftPlaten ? plateInfo : void 0,
        nodeIndex,
        beamSegments,
        segmentUitvoer
      ),
      ` in combinatie "${combo.name}"`
    );
  } catch (e) {
    const vertaald = metKnoopnummer(e, nodeIdMap, plateInfo);
    if (vertaald !== e) throw vertaald;
    const msg = e instanceof Error ? e.message : String(e);
    if (/P-Delta/.test(msg)) {
      throw new Error(
        `2e-orde-berekening niet convergent voor combinatie "${combo.name}" \u2014 belasting op of boven de kritieke (knik)waarde. Verlaag de belasting of verzwaar de constructie.`
      );
    }
    throw e;
  }
}
function solveAllCasesNonlinear(input) {
  const { perCase } = solveAllCases(input);
  const state = { input, cache: /* @__PURE__ */ new Map() };
  perCase[SECOND_ORDER_KEY] = state;
  return { perCase };
}
function buildMatrices(input) {
  const { mesh, nodeIdMap, beamIdMap } = buildMesh(
    { ...input, loads: [], supports: input.supports }
  );
  const engineK = assembleGlobalStiffnessMatrix(mesh, "frame");
  const dofsPerNode = getDofsPerNode("frame");
  const nodeIdToIndex = buildNodeIdToIndex(mesh, "frame");
  const nDof = nodeIdToIndex.size * dofsPerNode;
  const K = [];
  for (let i = 0; i < nDof; i++) {
    const row = [];
    for (let j = 0; j < nDof; j++) row.push(engineK.get(i, j));
    K.push(row);
  }
  const beamCache = [];
  for (const [uiId, meshId] of beamIdMap) {
    const beam = mesh.getBeamElement(meshId);
    if (!beam) continue;
    const nodes = mesh.getBeamElementNodes(beam);
    if (!nodes) continue;
    const [n1, n2] = nodes;
    const L = calculateBeamLength(n1, n2);
    const angle = calculateBeamAngle(n1, n2);
    const c = Math.cos(angle), s = Math.sin(angle);
    const mat = mesh.getMaterial(beam.materialId);
    const E = mat?.E ?? 21e10;
    const A = beam.section.A;
    const I = beam.section.I;
    const KlSparse = calculateBeamLocalStiffness(L, E, A, I);
    const kLocal = [];
    for (let i = 0; i < 6; i++) {
      const row = [];
      for (let j = 0; j < 6; j++) row.push(KlSparse.get(i, j));
      kLocal.push(row);
    }
    const T = [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1]
    ];
    const fromIdx = (nodeIdToIndex.get(n1.id) ?? 0) * dofsPerNode;
    const toIdx = (nodeIdToIndex.get(n2.id) ?? 0) * dofsPerNode;
    beamCache.push({ id: uiId, E, A, L, c, s, kLocal, T, fromIdx, toIdx });
  }
  const rigidConstraints = [];
  const springs = [];
  for (const node of mesh.nodes.values()) {
    const idx = nodeIdToIndex.get(node.id);
    if (idx === void 0) continue;
    const base = idx * dofsPerNode;
    const cstr = node.constraints ?? {};
    if (cstr.x) rigidConstraints.push({ dof: base + 0, supRef: node.id });
    if (cstr.y) rigidConstraints.push({ dof: base + 1, supRef: node.id });
    if (cstr.rotation) rigidConstraints.push({ dof: base + 2, supRef: node.id });
    if (cstr.springX) springs.push({ dof: base + 0, k: cstr.springX, nodeId: node.id, axis: 0 });
    if (cstr.springY) springs.push({ dof: base + 1, k: cstr.springY, nodeId: node.id, axis: 1 });
    if (cstr.springRot) springs.push({ dof: base + 2, k: cstr.springRot, nodeId: node.id, axis: 2 });
  }
  const uiNodeIndex = /* @__PURE__ */ new Map();
  for (const [uiId, meshId] of nodeIdMap) {
    const idx = nodeIdToIndex.get(meshId);
    if (idx !== void 0) uiNodeIndex.set(uiId, idx);
  }
  return { K, nDof, nodeIndex: uiNodeIndex, beams: beamCache, rigidConstraints, springs };
}

// src/components/fem/solver/normcombinaties.ts
var GEVOLGKLASSEN = ["CC1", "CC2", "CC3"];
var STANDAARD_GEVOLGKLASSE = "CC2";
var K_FI = { CC1: 0.9, CC2: 1, CC3: 1.1 };
var PARTIELE_FACTOREN = {
  CC1: { gGsup610a: 1.2, gGsup610b: 1.1, gGinf: 0.9, gQ: 1.35, bron: "NB tabel NB.5, CC1" },
  CC2: { gGsup610a: 1.35, gGsup610b: 1.2, gGinf: 0.9, gQ: 1.5, bron: "NB tabel NB.4, CC2" },
  CC3: { gGsup610a: 1.5, gGsup610b: 1.3, gGinf: 0.9, gQ: 1.65, bron: "NB tabel NB.5, CC3" }
};
var PSI_GEBRUIK = {
  A: { psi0: 0.4, psi1: 0.5, psi2: 0.3, omschrijving: "categorie A, woon- en verblijfsruimtes" },
  B: { psi0: 0.5, psi1: 0.5, psi2: 0.3, omschrijving: "categorie B, kantoorruimtes" },
  C: { psi0: 0.4, psi1: 0.7, psi2: 0.6, omschrijving: "categorie C, bijeenkomstruimtes (overige delen, voetnoot a: \u03C8\u2080 = 0,4)" },
  "C-menigte": { psi0: 0.6, psi1: 0.7, psi2: 0.6, omschrijving: "categorie C, delen die bij een calamiteit zwaar door een mensenmenigte belast kunnen worden (voetnoot a: \u03C8\u2080 = 0,6)" },
  D: { psi0: 0.4, psi1: 0.7, psi2: 0.6, omschrijving: "categorie D, winkelruimtes" },
  E: { psi0: 1, psi1: 0.9, psi2: 0.8, omschrijving: "categorie E, opslagruimtes" },
  F: { psi0: 0.7, psi1: 0.7, psi2: 0.6, omschrijving: "categorie F, verkeersruimte, voertuiggewicht \u2264 25 kN" },
  G: { psi0: 0.7, psi1: 0.5, psi2: 0.3, omschrijving: "categorie G, verkeersruimte, 25 kN < voertuiggewicht \u2264 160 kN" },
  H: { psi0: 0, psi1: 0, psi2: 0, omschrijving: "categorie H, daken" },
  "industrie-kort": { psi0: 0.5, psi1: 0.5, psi2: 0.3, omschrijving: "industrieel gebruik, belasting niet langdurig aanwezig" },
  "industrie-lang": { psi0: 1, psi1: 0.9, psi2: 0.8, omschrijving: "industrieel gebruik, belasting langdurig aanwezig" }
};
var PSI_SNEEUW = { psi0: 0, psi1: 0.2, psi2: 0 };
var PSI_WIND = { psi0: 0, psi1: 0.2, psi2: 0 };
var STANDAARD_CATEGORIE = "A";
var PSI_BRON = "\u03C8 uit NB tabel NB.2\u2013A1.1";
function basisSleutel(sleutel) {
  const i = sleutel.indexOf("|zonder:");
  return i < 0 ? sleutel : sleutel.slice(0, i);
}
var STANDAARD_BELASTINGGEVALLEN = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)", type: "live" },
  { id: 3, name: "Sneeuw (S)", type: "snow" },
  { id: 4, name: "Wind (W)", type: "wind" }
];
var MAX_VRIJE_GEVALLEN = 4;
function aantalGebruiksgevallen(gevallen) {
  return gevallen.filter((c) => c.type === "live" && c.gegenereerd?.bron !== "wind").length;
}
function nlGetal(x) {
  return String(Number(x.toFixed(3))).replace(".", ",");
}
function product(...f) {
  return Math.round(f.reduce((a, b) => a * b, 1) * 1e9) / 1e9;
}
function verzamelActies(gevallen) {
  const acties = [];
  const live = gevallen.filter((c) => c.type === "live");
  const categorieen = [];
  for (const c of live) {
    const cat = c.categorie ?? STANDAARD_CATEGORIE;
    if (!categorieen.includes(cat)) categorieen.push(cat);
  }
  for (const cat of categorieen) {
    const leden = live.filter((c) => (c.categorie ?? STANDAARD_CATEGORIE) === cat);
    acties.push({
      sleutel: `Q:${cat}`,
      soort: "Q",
      delen: leden.map((c) => ({ id: c.id, naam: c.name })),
      psi: PSI_GEBRUIK[cat],
      label: leden.length === 1 ? leden[0].name : `Q cat. ${cat}`,
      symbool: categorieen.length === 1 ? "Q" : `Q(${cat})`
    });
  }
  for (const [soort, type, psi] of [
    ["S", "snow", PSI_SNEEUW],
    ["W", "wind", PSI_WIND]
  ]) {
    const leden = gevallen.filter((c) => c.type === type);
    for (const c of leden) {
      acties.push({
        sleutel: `${soort}:${c.id}`,
        soort,
        delen: [{ id: c.id, naam: c.name }],
        psi,
        label: c.name,
        symbool: leden.length === 1 ? soort : `${soort}[${c.name}]`
      });
    }
  }
  return acties;
}
function bouw(naam, type, termen, bron, herkomst) {
  const werkzaam = termen.filter((t) => t.factor !== 0 && t.ids.length > 0);
  const factors = /* @__PURE__ */ new Map();
  for (const t of werkzaam) for (const id of t.ids) factors.set(id, t.factor);
  const formule = werkzaam.map((t) => t.tekst).join(" + ") || "0";
  return {
    name: naam,
    type,
    formula: `${formule}   [${bron}]`,
    factors,
    standaard: herkomst
  };
}
function aantalBits(m) {
  let n = 0;
  for (let x = m; x > 0; x >>= 1) n += x & 1;
  return n;
}
function opstellingen(bijdragen, perGeval) {
  const eenheden = [];
  for (const b of bijdragen) {
    if (b.factor === 0) continue;
    if (perGeval) for (const d of b.actie.delen) eenheden.push([d]);
    else if (!b.leidend) eenheden.push(b.actie.delen);
  }
  const maskers = Array.from({ length: 2 ** eenheden.length }, (_, m) => m).sort((a, b) => aantalBits(a) - aantalBits(b) || a - b);
  const uit = [];
  for (const masker of maskers) {
    const zonder = eenheden.filter((_, j) => (masker & 1 << j) !== 0).flat();
    const afwezig = new Set(zonder.map((d) => d.id));
    const aanwezig = bijdragen.map((b) => b.factor === 0 ? [] : b.actie.delen.filter((d) => !afwezig.has(d.id)));
    if (bijdragen.some((b, i) => b.leidend && b.factor !== 0 && aanwezig[i].length === 0)) continue;
    uit.push({ aanwezig, zonder });
  }
  return uit;
}
function symboolVan(actie, aanwezig) {
  return aanwezig.length === actie.delen.length ? actie.symbool : `${actie.symbool}[${aanwezig.map((d) => d.naam).join(" + ")}]`;
}
function uitdrukking(naam, type, soort, sleutel, g, bijdragen, bron, gevolgklasse, perGeval) {
  return opstellingen(bijdragen, perGeval).map((o) => {
    const termen = [
      g,
      ...bijdragen.map((b, i) => ({
        ids: o.aanwezig[i].map((d) => d.id),
        factor: b.factor,
        tekst: b.tekst(symboolVan(b.actie, o.aanwezig[i]))
      }))
    ];
    const zonderNaam = o.zonder.length === 0 ? "" : `${naam.includes(" \u2014 ") ? "," : " \u2014"} zonder ${o.zonder.map((d) => d.naam).join(", ")}`;
    const zonderSleutel = o.zonder.length === 0 ? "" : `|zonder:${o.zonder.map((d) => d.id).sort((a, b) => a - b).join("+")}`;
    return bouw(naam + zonderNaam, type, termen, bron, {
      sleutel: sleutel + zonderSleutel,
      soort,
      gevolgklasse
    });
  });
}
function ontdubbel(set) {
  const gezien = /* @__PURE__ */ new Set();
  return set.filter((c) => {
    if (c.factors.size === 0) return false;
    const inhoud = [...c.factors].sort((a, b) => a[0] - b[0]).map(([id, x]) => `${id}:${x}`).join(",");
    const k = `${c.type}|${c.standaard.soort}|${inhoud}`;
    if (gezien.has(k)) return false;
    gezien.add(k);
    return true;
  });
}
function genereerStandaardCombinaties(loadCases, gevolgklasse = STANDAARD_GEVOLGKLASSE) {
  const f = PARTIELE_FACTOREN[gevolgklasse];
  const eigen = loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
  const G2 = eigen.filter((c) => c.type === "dead").map((c) => c.id);
  const acties = verzamelActies(eigen);
  if (G2.length === 0 && acties.length === 0) return [];
  const perGeval = aantalGebruiksgevallen(eigen) <= MAX_VRIJE_GEVALLEN;
  const ugtBron = `\u03B3: NEN-EN 1990 ${f.bron}; ${PSI_BRON}`;
  const bgtBron = `NEN-EN 1990; ${PSI_BRON}`;
  const herkomst = (sleutel, soort) => ({
    sleutel,
    soort,
    gevolgklasse
  });
  const g = (factor) => ({
    ids: G2,
    factor,
    tekst: factor === 1 ? "G" : `${nlGetal(factor)}\xB7G`
  });
  const leidend = (a, factor) => ({
    actie: a,
    factor,
    leidend: true,
    tekst: (s) => factor === 1 ? s : `${nlGetal(factor)}\xB7${s}`
  });
  const begeleidend = (hoofd, \u03C8, \u03B3) => acties.filter((a) => a !== hoofd).filter((a) => !(hoofd && a.soort === hoofd.soort && a.soort !== "Q")).map((a) => ({
    actie: a,
    factor: product(\u03B3, \u03C8(a)),
    leidend: false,
    tekst: (s) => \u03B3 === 1 ? `${nlGetal(\u03C8(a))}\xB7${s}` : `${nlGetal(\u03B3)}\xB7${nlGetal(\u03C8(a))}\xB7${s}`
  }));
  const \u03C80 = (a) => a.psi.psi0;
  const \u03C82 = (a) => a.psi.psi2;
  const ugt = [];
  const bgt = [];
  ugt.push(...uitdrukking(
    "UGT 6.10a",
    "uls",
    "6.10a",
    "6.10a",
    g(f.gGsup610a),
    begeleidend(null, \u03C80, f.gQ),
    ugtBron,
    gevolgklasse,
    perGeval
  ));
  for (const a of acties) {
    ugt.push(...uitdrukking(
      `UGT 6.10b \u2014 ${a.label} leidend`,
      "uls",
      "6.10b",
      `6.10b|${a.sleutel}`,
      g(f.gGsup610b),
      [leidend(a, f.gQ), ...begeleidend(a, \u03C80, f.gQ)],
      ugtBron,
      gevolgklasse,
      perGeval
    ));
  }
  if (G2.length > 0) {
    for (const a of acties) {
      ugt.push(...uitdrukking(
        `UGT 6.10b \u2014 ${a.label} leidend, blijvend gunstig`,
        "uls",
        "6.10b",
        `6.10b-gunstig|${a.sleutel}`,
        g(f.gGinf),
        [leidend(a, f.gQ), ...begeleidend(a, \u03C80, f.gQ)],
        ugtBron,
        gevolgklasse,
        perGeval
      ));
    }
  }
  if (acties.length === 0) {
    bgt.push(bouw(
      "BGT karakteristiek 6.14b \u2014 alleen blijvend",
      "sls",
      [g(1)],
      bgtBron,
      herkomst("6.14b|G", "6.14b")
    ));
    bgt.push(bouw(
      "BGT frequent 6.15b \u2014 alleen blijvend",
      "sls",
      [g(1)],
      bgtBron,
      herkomst("6.15b|G", "6.15b")
    ));
  } else {
    for (const a of acties) {
      bgt.push(...uitdrukking(
        `BGT karakteristiek 6.14b \u2014 ${a.label} leidend`,
        "sls",
        "6.14b",
        `6.14b|${a.sleutel}`,
        g(1),
        [leidend(a, 1), ...begeleidend(a, \u03C80, 1)],
        bgtBron,
        gevolgklasse,
        perGeval
      ));
    }
    for (const a of acties) {
      bgt.push(...uitdrukking(
        `BGT frequent 6.15b \u2014 ${a.label} leidend`,
        "sls",
        "6.15b",
        `6.15b|${a.sleutel}`,
        g(1),
        [leidend(a, a.psi.psi1), ...begeleidend(a, \u03C82, 1)],
        bgtBron,
        gevolgklasse,
        perGeval
      ));
    }
  }
  bgt.push(...uitdrukking(
    "BGT quasi-blijvend 6.16b",
    "sls",
    "6.16b",
    "6.16b",
    g(1),
    begeleidend(null, \u03C82, 1),
    bgtBron,
    gevolgklasse,
    perGeval
  ));
  return ontdubbel([...ugt, ...bgt]);
}
function begeleidendeOpstellingen(gevallen, leidendeSoort, factor) {
  const eigen = gevallen.filter((c) => c.gegenereerd?.bron !== "wind");
  const bijdragen = verzamelActies(eigen).filter((a) => !(a.soort === leidendeSoort && a.soort !== "Q")).map((a) => ({ actie: a, factor: product(factor(a.psi)), leidend: false, tekst: (s) => s }));
  const perGeval = aantalGebruiksgevallen(eigen) <= MAX_VRIJE_GEVALLEN;
  return opstellingen(bijdragen, perGeval).map((o) => ({
    factoren: bijdragen.flatMap((b, i) => b.factor === 0 ? [] : o.aanwezig[i].map((d) => [d.id, b.factor])),
    zonder: o.zonder
  }));
}

// src/components/fem/solver/combinations.ts
var SCHEEFSTAND_COMBO_OFFSET = 1e6;
function scheefstandRichtingLabel(richting2) {
  return richting2 === 1 ? "+x" : "\u2212x";
}
function metScheefstandRichtingen(combinations, aan, primair = 1) {
  if (!aan) return combinations;
  const uit = [];
  for (const c of combinations) {
    if (c.scheefstandRichting !== void 0) {
      uit.push(c);
      continue;
    }
    const tegen2 = -primair;
    uit.push({
      ...c,
      scheefstandRichting: primair,
      name: `${c.name} (scheefstand ${scheefstandRichtingLabel(primair)})`
    });
    uit.push({
      ...c,
      id: c.id + SCHEEFSTAND_COMBO_OFFSET,
      scheefstandRichting: tegen2,
      name: `${c.name} (scheefstand ${scheefstandRichtingLabel(tegen2)})`
    });
  }
  return uit;
}
var SOORTEN_BUITEN_STAAL = ["6.15b", "6.16b"];
function defaultCombinations(loadCases = STANDAARD_BELASTINGGEVALLEN, gevolgklasse = STANDAARD_GEVOLGKLASSE) {
  return genereerStandaardCombinaties(loadCases, gevolgklasse).map((c, i) => ({
    ...c,
    id: i + 1
  }));
}
function soortVanCombinatie(c) {
  if (c.standaard) return c.standaard.soort;
  if (c.type === "sls") {
    if (/karakter/i.test(c.name)) return "6.14b";
    if (/frequent/i.test(c.name)) return "6.15b";
    if (/quasi/i.test(c.name)) return "6.16b";
    return null;
  }
  if (/6\.10a/.test(c.name)) return "6.10a";
  if (/6\.10b/.test(c.name)) return "6.10b";
  return null;
}
function combinatiesVanSoort(combinations, soort) {
  return combinations.filter((c) => soortVanCombinatie(c) === soort);
}
function combineResults(combo, perCase) {
  const so = getSecondOrderState(perCase);
  if (so) {
    const key = `${combo.id}|` + [...combo.factors.entries()].sort((a, b) => a[0] - b[0]).map(([cid, f]) => `${cid}=${f}`).join(",");
    let res = so.cache.get(key);
    if (res === void 0) {
      const solved = solveCombinationSecondOrder(so.input, combo);
      if (solved) {
        so.cache.set(key, solved);
        return solved;
      }
    } else {
      return res;
    }
  }
  const sr = getScheefstandRichtingen(perCase);
  const tegen2 = sr !== void 0 && combo.scheefstandRichting !== void 0 && combo.scheefstandRichting !== sr.primair;
  const idVan = (caseId) => tegen2 ? caseId + sr.offset : caseId;
  const nodeIds = /* @__PURE__ */ new Set();
  const beamIds = /* @__PURE__ */ new Set();
  const reactionIds = /* @__PURE__ */ new Set();
  for (const [caseId] of combo.factors) {
    const r = perCase.get(idVan(caseId));
    if (!r) continue;
    r.displacements.forEach((_, id) => nodeIds.add(id));
    r.elements.forEach((_, id) => beamIds.add(id));
    r.reactions.forEach((_, id) => reactionIds.add(id));
  }
  const displacements = /* @__PURE__ */ new Map();
  let maxDisp = 0;
  for (const nid of nodeIds) {
    let ux = 0, uz = 0, ry = 0;
    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(idVan(caseId));
      if (!r) continue;
      const d = r.displacements.get(nid);
      if (!d) continue;
      ux += factor * d.ux;
      uz += factor * d.uz;
      ry += factor * d.ry;
    }
    displacements.set(nid, { ux, uz, ry });
    const mag = Math.max(Math.abs(ux), Math.abs(uz));
    if (mag > maxDisp) maxDisp = mag;
  }
  const reactions = /* @__PURE__ */ new Map();
  for (const rid of reactionIds) {
    let fx = 0, fz = 0, my = 0;
    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(idVan(caseId));
      if (!r) continue;
      const rxn = r.reactions.get(rid);
      if (!rxn) continue;
      fx += factor * rxn.fx;
      fz += factor * rxn.fz;
      my += factor * rxn.my;
    }
    reactions.set(rid, { fx, fz, my });
  }
  const elements = /* @__PURE__ */ new Map();
  for (const bid of beamIds) {
    let N = 0, V = 0, Ms = 0, Me = 0;
    let L_mm = 0;
    let stations_mm = [];
    let normalForce = [];
    let shearForce = [];
    let bendingMoment = [];
    let deflection = [];
    let axialDisp = [];
    let rotation = [];
    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(idVan(caseId));
      if (!r) continue;
      const ef = r.elements.get(bid);
      if (!ef) continue;
      N += factor * ef.N;
      V += factor * ef.V;
      Ms += factor * ef.M_start;
      Me += factor * ef.M_end;
      if (L_mm === 0) L_mm = ef.L_mm;
      if (stations_mm.length === 0 && ef.stations_mm.length > 0) {
        L_mm = ef.L_mm;
        stations_mm = ef.stations_mm.slice();
        normalForce = new Array(ef.stations_mm.length).fill(0);
        shearForce = new Array(ef.stations_mm.length).fill(0);
        bendingMoment = new Array(ef.stations_mm.length).fill(0);
        deflection = new Array(ef.stations_mm.length).fill(0);
        axialDisp = new Array(ef.stations_mm.length).fill(0);
        rotation = new Array(ef.stations_mm.length).fill(0);
      }
      for (let i = 0; i < ef.stations_mm.length && i < normalForce.length; i++) {
        normalForce[i] += factor * (ef.normalForce[i] ?? 0);
        shearForce[i] += factor * (ef.shearForce[i] ?? 0);
        bendingMoment[i] += factor * (ef.bendingMoment[i] ?? 0);
        deflection[i] += factor * (ef.deflection?.[i] ?? 0);
        axialDisp[i] += factor * (ef.axialDisp?.[i] ?? 0);
        rotation[i] += factor * (ef.rotation?.[i] ?? 0);
      }
    }
    elements.set(bid, {
      N,
      V,
      M_start: Ms,
      M_end: Me,
      L_mm,
      stations_mm,
      normalForce,
      shearForce,
      bendingMoment,
      deflection,
      axialDisp,
      rotation
    });
  }
  const plateIds = /* @__PURE__ */ new Set();
  for (const [caseId] of combo.factors) {
    perCase.get(idVan(caseId))?.plateElements?.forEach((p) => plateIds.add(p.plateId));
  }
  let plateElements;
  if (plateIds.size > 0) {
    plateElements = [];
    for (const pid of plateIds) {
      let referentie;
      for (const [caseId] of combo.factors) {
        referentie = perCase.get(idVan(caseId))?.plateElements?.find((p) => p.plateId === pid);
        if (referentie) break;
      }
      if (!referentie) continue;
      const n = referentie.elements.length;
      const gecombineerd = referentie.elements.map((el) => ({
        elementId: el.elementId,
        corners: el.corners,
        sigmaX: 0,
        sigmaY: 0,
        tauXY: 0,
        vonMises: 0,
        sigma1: 0,
        sigma2: 0,
        angle: 0,
        nx: 0,
        ny: 0,
        nxy: 0
      }));
      for (const [caseId, factor] of combo.factors) {
        const bron = perCase.get(idVan(caseId))?.plateElements?.find((p) => p.plateId === pid);
        if (!bron) continue;
        for (let i = 0; i < n && i < bron.elements.length; i++) {
          const s = bron.elements[i];
          const d = gecombineerd[i];
          d.sigmaX += factor * s.sigmaX;
          d.sigmaY += factor * s.sigmaY;
          d.tauXY += factor * s.tauXY;
          d.nx += factor * s.nx;
          d.ny += factor * s.ny;
          d.nxy += factor * s.nxy;
        }
      }
      const ranges = {
        sigmaX: { min: Infinity, max: -Infinity },
        sigmaY: { min: Infinity, max: -Infinity },
        tauXY: { min: Infinity, max: -Infinity },
        vonMises: { min: Infinity, max: -Infinity },
        nx: { min: Infinity, max: -Infinity },
        ny: { min: Infinity, max: -Infinity },
        nxy: { min: Infinity, max: -Infinity }
      };
      for (const d of gecombineerd) {
        const { sigmaX: sx, sigmaY: sy, tauXY: t } = d;
        d.vonMises = Math.sqrt(sx * sx + sy * sy - sx * sy + 3 * t * t);
        const midden = (sx + sy) / 2;
        const straal = Math.hypot((sx - sy) / 2, t);
        d.sigma1 = midden + straal;
        d.sigma2 = midden - straal;
        d.angle = 0.5 * Math.atan2(2 * t, sx - sy);
        for (const [sleutel, waarde] of [
          ["sigmaX", d.sigmaX],
          ["sigmaY", d.sigmaY],
          ["tauXY", d.tauXY],
          ["vonMises", d.vonMises],
          ["nx", d.nx],
          ["ny", d.ny],
          ["nxy", d.nxy]
        ]) {
          const r = ranges[sleutel];
          if (waarde < r.min) r.min = waarde;
          if (waarde > r.max) r.max = waarde;
        }
      }
      plateElements.push({ plateId: pid, elements: gecombineerd, ranges });
    }
    if (plateElements.length === 0) plateElements = void 0;
  }
  return { displacements, reactions, elements, maxDisplacement: maxDisp, plateElements };
}
function staafExtremen(ef) {
  const n = ef.stations_mm.length;
  if (n === 0) {
    const absStart = Math.abs(ef.M_start);
    const absEnd = Math.abs(ef.M_end);
    return {
      N_min: ef.N,
      N_max: ef.N,
      V_min: ef.V,
      V_max: ef.V,
      M_min: Math.min(ef.M_start, ef.M_end),
      M_max: Math.max(ef.M_start, ef.M_end),
      mAbs: Math.max(absStart, absEnd),
      mPos_mm: absEnd > absStart ? ef.L_mm : 0
    };
  }
  let N_min = Infinity, N_max = -Infinity;
  let V_min = Infinity, V_max = -Infinity;
  let M_min = Infinity, M_max = -Infinity;
  let mAbs = -Infinity, mPos_mm = ef.stations_mm[0] ?? 0;
  for (let i = 0; i < n; i++) {
    const nx = ef.normalForce[i] ?? 0;
    const vx = ef.shearForce[i] ?? 0;
    const mx = ef.bendingMoment[i] ?? 0;
    if (nx < N_min) N_min = nx;
    if (nx > N_max) N_max = nx;
    if (vx < V_min) V_min = vx;
    if (vx > V_max) V_max = vx;
    if (mx < M_min) M_min = mx;
    if (mx > M_max) M_max = mx;
    const a = Math.abs(mx);
    if (a > mAbs) {
      mAbs = a;
      mPos_mm = ef.stations_mm[i] ?? 0;
    }
  }
  return { N_min, N_max, V_min, V_max, M_min, M_max, mAbs, mPos_mm };
}
function computeEnvelope(combinations, perCase) {
  const sr = getScheefstandRichtingen(perCase);
  if (sr && combinations.every((c) => c.scheefstandRichting === void 0)) {
    combinations = metScheefstandRichtingen(combinations, true, sr.primair);
  }
  const elements = /* @__PURE__ */ new Map();
  const reactions = /* @__PURE__ */ new Map();
  let maxDisplacement = 0;
  let maxDisplacementCombinationId = null;
  const combined = combinations.map((c) => ({
    combo: c,
    res: combineResults(c, perCase)
  }));
  for (const { combo, res } of combined) {
    res.elements.forEach((ef, beamId) => {
      const e = staafExtremen(ef);
      const prev = elements.get(beamId);
      if (!prev) {
        elements.set(beamId, {
          N_min: e.N_min,
          N_max: e.N_max,
          V_min: e.V_min,
          V_max: e.V_max,
          M_min: e.M_min,
          M_max: e.M_max,
          governingCombinationId: combo.id,
          governingMAbs: e.mAbs,
          governingMPos_mm: e.mPos_mm
        });
      } else {
        prev.N_min = Math.min(prev.N_min, e.N_min);
        prev.N_max = Math.max(prev.N_max, e.N_max);
        prev.V_min = Math.min(prev.V_min, e.V_min);
        prev.V_max = Math.max(prev.V_max, e.V_max);
        prev.M_min = Math.min(prev.M_min, e.M_min);
        prev.M_max = Math.max(prev.M_max, e.M_max);
        if (e.mAbs > prev.governingMAbs) {
          prev.governingCombinationId = combo.id;
          prev.governingMAbs = e.mAbs;
          prev.governingMPos_mm = e.mPos_mm;
        }
      }
    });
    res.reactions.forEach((r, nodeId) => {
      const prev = reactions.get(nodeId);
      if (!prev) {
        reactions.set(nodeId, {
          fx_min: r.fx,
          fx_max: r.fx,
          fz_min: r.fz,
          fz_max: r.fz
        });
      } else {
        prev.fx_min = Math.min(prev.fx_min, r.fx);
        prev.fx_max = Math.max(prev.fx_max, r.fx);
        prev.fz_min = Math.min(prev.fz_min, r.fz);
        prev.fz_max = Math.max(prev.fz_max, r.fz);
      }
    });
    if (res.maxDisplacement > maxDisplacement) {
      maxDisplacement = res.maxDisplacement;
      maxDisplacementCombinationId = combo.id;
    }
  }
  return { elements, reactions, maxDisplacement, maxDisplacementCombinationId };
}

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);

// src/lib/profieleditor/eigenDoorsnedenStore.ts
var EIGEN_PREFIX = "EIGEN:";
var OPSLAG_SLEUTEL = "openaec.eigenDoorsneden.v1";
function isEigenProfiel(profile) {
  return !!profile && profile.startsWith(EIGEN_PREFIX);
}
function eigenNaamVan(profile) {
  return isEigenProfiel(profile) ? profile.slice(EIGEN_PREFIX.length) : null;
}
function lees() {
  try {
    const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
    if (!ruw) return [];
    const data = JSON.parse(ruw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function schrijf(items) {
  try {
    localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(items));
  } catch {
  }
}
function sorteer(items) {
  return [...items].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}
function doorsnedeGelijk(a, b) {
  const kern = (d) => JSON.stringify({ ontwerp: d.ontwerp, eigenschappen: d.eigenschappen, vorm: d.vorm, motor: d.motor });
  return kern(a) === kern(b);
}
var eigenDoorsnedenStore = createStore((set, get) => ({
  items: lees(),
  bewaar: (d) => {
    const rest = get().items.filter((x) => x.id !== d.id && x.naam !== d.naam);
    const items = sorteer([...rest, d]);
    schrijf(items);
    set({ items });
  },
  verwijder: (id) => {
    const items = get().items.filter((x) => x.id !== id);
    schrijf(items);
    set({ items });
  },
  vervangAlles: (items) => {
    const gesorteerd = sorteer(items);
    schrijf(gesorteerd);
    set({ items: gesorteerd });
  },
  voegSamen: (binnen) => {
    const lokaal = get().items;
    const overschreven = binnen.filter((b) => {
      const bestaand = lokaal.find((x) => x.naam === b.naam);
      return bestaand !== void 0 && !doorsnedeGelijk(bestaand, b);
    }).map((b) => b.naam);
    const rest = lokaal.filter((x) => !binnen.some((b) => b.naam === x.naam || b.id === x.id));
    const items = sorteer([...rest, ...binnen]);
    schrijf(items);
    set({ items });
    return overschreven;
  }
}));
function zoekEigenDoorsnede(profile) {
  const naam = eigenNaamVan(profile);
  if (naam === null) return void 0;
  return eigenDoorsnedenStore.getState().items.find((d) => d.naam === naam);
}
function naarCustomSection(d) {
  const o = d.ontwerp;
  if (o.soort === "samenstelling" && o.catalogusdelen.length === 0 && o.lamellen.length > 0) {
    return {
      naam: d.naam,
      lamellen: o.lamellen.map((l) => ({
        b_mm: l.b_mm,
        t_mm: l.t_mm,
        y_mm: l.y_mm,
        z_mm: l.z_mm,
        alpha_rad: l.alphaGraden * Math.PI / 180
      })),
      gesloten_cellen: (d.motor.cel ? [d.motor.cel] : []).map((c) => ({
        midlijn: c.midlijn.map(([y, z]) => ({ y_mm: y, z_mm: z })),
        dikte_mm: c.dikte_mm,
        lamellen: c.lamellen
      })),
      eigenschappen: null,
      vorm: "Onbekend"
    };
  }
  return {
    naam: d.naam,
    lamellen: [],
    gesloten_cellen: [],
    eigenschappen: d.eigenschappen,
    vorm: d.vorm
  };
}

// src/lib/referentierichting.ts
function referentieVanStaaf(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return { gespiegeld: false, staafstand: "Liggend" };
  const staand = isOverwegendVerticaal(beam, nodes);
  return {
    gespiegeld: staand ? a.z > b.z : a.x > b.x,
    staafstand: staand ? "Staand" : "Liggend"
  };
}
function tegen(v) {
  return v === 0 ? 0 : -v;
}
function omgekeerd(a) {
  return [...a].reverse();
}
function spiegelElementKrachten(ef) {
  const L = ef.L_mm;
  const laatste = (a, anders) => a.length > 0 ? a[a.length - 1] : anders;
  const uit = {
    N: laatste(ef.normalForce, ef.N),
    V: laatste(ef.shearForce, ef.V),
    M_start: tegen(ef.M_end),
    M_end: tegen(ef.M_start),
    L_mm: L,
    stations_mm: omgekeerd(ef.stations_mm).map((x) => L - x),
    normalForce: omgekeerd(ef.normalForce),
    shearForce: omgekeerd(ef.shearForce),
    bendingMoment: omgekeerd(ef.bendingMoment).map(tegen),
    deflection: omgekeerd(ef.deflection).map(tegen),
    axialDisp: omgekeerd(ef.axialDisp).map(tegen)
  };
  if (ef.rotation) uit.rotation = omgekeerd(ef.rotation);
  if (ef.segmenten) uit.segmenten = omgekeerd(ef.segmenten).map((s) => spiegelSegment(s, L));
  return uit;
}
function spiegelSegment(s, L) {
  return {
    xStart: L - s.xEnd,
    xEnd: L - s.xStart,
    I: s.I,
    // De index wijst in `SolverBeamInput.segmenten`, de solverinvoer, en die
    // wordt niet gespiegeld.
    segmentIndex: s.segmentIndex,
    N_start: s.N_end,
    N_end: s.N_start,
    M_start: tegen(s.M_end),
    M_end: tegen(s.M_start),
    M_max: tegen(s.M_max),
    N_bij_M_max: s.N_bij_M_max
  };
}
function spiegelFracties(fracties) {
  return fracties.map((f) => Math.round((1 - f) * 1e12) / 1e12);
}
function spiegelZones(zones, lengteMm) {
  return {
    longitudinal: omgekeerd(zones.longitudinal ?? []).map((z) => ({
      ...z,
      x_start_mm: lengteMm - z.x_end_mm,
      x_end_mm: lengteMm - z.x_start_mm
    })),
    stirrups: omgekeerd(zones.stirrups ?? []).map((z) => ({
      ...z,
      x_start_mm: lengteMm - z.x_end_mm,
      x_end_mm: lengteMm - z.x_start_mm
    }))
  };
}
function spiegelEinden(einden) {
  const uit = {};
  for (const [sleutel, waarde] of Object.entries(einden)) {
    const nieuw = sleutel.startsWith("start") ? `end${sleutel.slice("start".length)}` : sleutel.startsWith("end") ? `start${sleutel.slice("end".length)}` : sleutel;
    uit[nieuw] = waarde;
  }
  return uit;
}
function spiegelToetsconfig(cfg, lengteMm) {
  const uit = { ...cfg };
  for (const [sleutel, waarde] of Object.entries(cfg)) {
    if (waarde == null) continue;
    const regel = SPIEGELREGELS_TOETSCONFIG[sleutel];
    if (regel === "fracties" && Array.isArray(waarde)) {
      uit[sleutel] = spiegelFracties(waarde);
    } else if (regel === "zonesMm") {
      uit[sleutel] = spiegelZones(waarde, lengteMm);
    }
  }
  return uit;
}
function staafInReferentierichting(beam, nodes) {
  if (!referentieVanStaaf(beam, nodes).gespiegeld) return beam;
  const lengteMm = beamLengthMm(beam, nodes);
  const uit = { ...beam, from: beam.to, to: beam.from };
  if (beam.profileEnd !== void 0) {
    uit.profile = beam.profileEnd;
    uit.profileEnd = beam.profile;
  }
  if (beam.releases) uit.releases = spiegelEinden(beam.releases);
  if (beam.veren) uit.veren = spiegelEinden(beam.veren);
  if (beam.checkConfig) uit.checkConfig = spiegelToetsconfig(beam.checkConfig, lengteMm);
  return uit;
}
function resultaatInReferentierichting(result, gespiegeld) {
  let elements = null;
  for (const id of gespiegeld) {
    const ef = result.elements.get(id);
    if (!ef) continue;
    elements ??= new Map(result.elements);
    elements.set(id, spiegelElementKrachten(ef));
  }
  return elements ? { ...result, elements } : result;
}
function toetsdataInReferentierichting(data) {
  const gespiegeld = /* @__PURE__ */ new Set();
  for (const b of data.beams) {
    if (referentieVanStaaf(b, data.nodes).gespiegeld) gespiegeld.add(b.id);
  }
  if (gespiegeld.size === 0) return data;
  return {
    ...data,
    beams: data.beams.map((b) => staafInReferentierichting(b, data.nodes)),
    combinationResults: new Map(
      [...data.combinationResults].map(
        ([id, r]) => [id, resultaatInReferentierichting(r, gespiegeld)]
      )
    )
  };
}
function zijdenInWereldtermen(staafstand) {
  return staafstand === "Staand" ? { onder: "rechts", boven: "links" } : { onder: "onder", boven: "boven" };
}
function nl(v) {
  return String(Math.round(v * 100) / 100).replace(".", ",");
}
var SPRONGBAND_GRADEN = 10;
function richtingssprongNabij(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  const helling = hellingGradenVanStaaf(beam, nodes);
  if (!a || !b || helling === null) return null;
  const voet = a.z <= b.z ? a : b;
  const kop = voet === a ? b : a;
  if (!(kop.z > voet.z && kop.x < voet.x)) return null;
  const afstand2 = Math.abs(helling - VERTICAAL_VANAF_GRADEN);
  if (afstand2 > SPRONGBAND_GRADEN + 1e-9) return null;
  return {
    hellingGraden: helling,
    staafstand: referentieVanStaaf(beam, nodes).staafstand,
    afstandTotGrensGraden: afstand2
  };
}
function gradenTekst(v) {
  return `${String(Math.round(v * 10) / 10).replace(".", ",")}\xB0`;
}
function richtingssprongNotities(beam, nodes, soort) {
  const s = richtingssprongNabij(beam, nodes);
  if (!s) return [];
  const boven = soort === "staal" ? "de BOVENflens" : "de BOVENwapening";
  const wat = soort === "staal" ? "de kipsteunen die aan de boven- en aan de onderflens zijn opgegeven" : "de boven- en de onderwapening van de korf";
  const grens = `${VERTICAAL_VANAF_GRADEN}\xB0`;
  const kop = `Richtingssprong nabij. Deze staaf helt naar LINKS onder ${gradenTekst(s.hellingGraden)} met de horizontaal, ${gradenTekst(s.afstandTotGrensGraden)} ${s.staafstand === "Staand" ? "boven" : "onder"} de grens van ${grens} waar een staaf staand gaat heten. `;
  const slot = ` Controleer na elke wijziging van de knopen aan welke fysieke zijde ${wat} horen. (Deze waarschuwing staat bij elke naar links hellende staaf binnen ${SPRONGBAND_GRADEN}\xB0 van de grens.)`;
  if (s.staafstand === "Liggend") {
    return [
      kop + `Hij is getoetst van links naar rechts, en ${boven} is de fysieke BOVENzijde (rechtsboven). Vanaf ${grens} wordt hij van voet naar kop getoetst en ligt ${boven} aan de linkerzijde: bij deze helling de fysieke ONDERzijde (linksonder). Een kleine wijziging van de geometrie keert dan zonder verdere melding om welke zijde boven heet.` + slot
    ];
  }
  return [
    kop + `Hij is getoetst van voet naar kop, en ${boven} ligt aan de linkerzijde: bij deze helling de fysieke ONDERzijde (linksonder), NIET het bovenvlak. Onder ${grens} zou ${boven} de fysieke bovenzijde (rechtsboven) zijn. Lees "boven" bij deze staaf dus niet als het bovenvlak.` + slot
  ];
}
function zeegVoorToets(beam, nodes) {
  const cfg = beam.checkConfig ?? {};
  if (cfg.preCamber_mm === void 0) return cfg;
  if (referentieVanStaaf(beam, nodes).staafstand === "Liggend") return cfg;
  const zonder = { ...cfg };
  delete zonder.preCamber_mm;
  return zonder;
}
function zeegNotities(beam, nodes) {
  const zeeg = beam.checkConfig?.preCamber_mm;
  if (zeeg === void 0 || zeeg === 0) return [];
  if (referentieVanStaaf(beam, nodes).staafstand === "Liggend") return [];
  return [
    `De opgegeven zeeg van ${nl(zeeg)} mm is NIET verrekend. NEN-EN 1990 A1.4.3(2) definieert de zeeg w_c bij de VERTICALE doorbuiging (figuur A1.1); deze staaf staat overwegend verticaal (75\xB0 of meer met de horizontaal), en daar bestaat "omhoog" loodrecht op de staaf niet. Een zeeg verandert bovendien de horizontale verplaatsing van de kop ten opzichte van de voet niet.`
  ];
}
var SPIEGELREGELS_ELEMENTKRACHTEN = {
  N: "de normaalkracht aan het nieuwe begin (het oude eind); trek blijft trek",
  V: "de dwarskracht aan het nieuwe begin; V = dM/dx en x \xE9n M klappen om, dus geen tekenwissel",
  M_start: "\u2212M_end: het moment aan het oude eind, met omgekeerd teken",
  M_end: "\u2212M_start",
  L_mm: "gelijk",
  stations_mm: "L \u2212 x, in omgekeerde volgorde",
  normalForce: "omgekeerde volgorde, zelfde teken",
  shearForce: "omgekeerde volgorde, zelfde teken",
  bendingMoment: "omgekeerde volgorde, tegengesteld teken (+y klapt om, dus 'onder' ook)",
  deflection: "omgekeerde volgorde, tegengesteld teken (w staat langs lokaal +y)",
  axialDisp: "omgekeerde volgorde, tegengesteld teken (u staat langs de staafas)",
  rotation: "omgekeerde volgorde, zelfde teken (een draaiing in het vlak hangt niet aan de as)",
  segmenten: "x \u2192 L \u2212 x, begin en eind verwisseld, momenten tegengesteld; segmentIndex blijft"
};
var SPIEGELREGELS_STAAF = {
  id: "gelijk",
  from: "wordt de eindknoop",
  to: "wordt de beginknoop",
  material: "gelijk",
  profile: "wordt het eindprofiel als er een verloop is (profileEnd); anders gelijk",
  profileEnd: "wordt het beginprofiel: begin en eind van het verloop verwisseld",
  releases: "begin en eind verwisseld",
  veren: "begin en eind verwisseld",
  checkConfig: "per veld, zie SPIEGELREGELS_TOETSCONFIG",
  loadRole: "gelijk: het staaftype hangt niet aan de tekenrichting",
  bedding: "gelijk: over de hele staaf"
};
var SPIEGELREGELS_TOETSCONFIG = {
  bucklingLengthY_m: "gelijk",
  bucklingLengthZ_m: "gelijk",
  // Fracties vanaf de beginknoop.
  lateralRestraints: "fracties",
  lateralRestraintsBottom: "fracties",
  deflectionClass: "gelijk",
  deflectionLimitNumerator: "gelijk",
  deflectionAddLimitNumerator: "gelijk",
  // Een grootte omhoog, geen positie; bij een staande staaf zie `zeegVoorToets`.
  preCamber_mm: "gelijk",
  serviceClass: "gelijk",
  loadDuration: "gelijk",
  // Een afstand, geen positie.
  ltbSupportSpacing_m: "gelijk",
  // Een factor, een schakelaar en een ZIJDE (druk/trek) in de
  // referentierichting: geen van drie hangt aan de tekenrichting.
  kCr: "gelijk",
  performLtbCheck: "gelijk",
  ltbLoadPosition: "gelijk",
  // Boven en onder zijn ZIJDEN in de referentierichting, geen posities.
  betonKorf: "gelijk",
  betonMilieuklasse: "gelijk",
  betonConstructieklasse: "gelijk",
  betonStaalsoort: "gelijk",
  betonStroken: "gelijk",
  betonStaaltak: "gelijk",
  // Schoring, kniklengte, kruip en een beugelzone-SOORT: geen posities.
  betonKolom: "gelijk",
  // Maten in mm vanaf de beginknoop.
  betonZones: "zonesMm",
  spanningSigmaZ: "gelijk"
};

// src/lib/doorgaandeLijn.ts
var nl2 = (v, d = 3) => v.toFixed(d).replace(".", ",");
function richting(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  if (l <= 0) return null;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}
function vindDoorgaandeLijnen(beams, nodes, alleBeams, supports) {
  if (!supports) return [];
  const perId = new Map(alleBeams.map((b) => [b.id, b]));
  const teToetsen = new Set(beams.map((b) => b.id));
  const gezien = /* @__PURE__ */ new Set();
  const lijnen = [];
  for (const start of beams) {
    if (gezien.has(start.id)) continue;
    const leden = [];
    const wachtrij = [start];
    gezien.add(start.id);
    while (wachtrij.length > 0) {
      const b = wachtrij.pop();
      leden.push(b);
      for (const id of collinearContinuations(b, nodes, alleBeams, supports)) {
        if (gezien.has(id)) continue;
        const other = perId.get(id);
        if (!other) continue;
        gezien.add(id);
        wachtrij.push(other);
      }
    }
    if (leden.length < 2) continue;
    const dir = richting(start, nodes);
    if (!dir) continue;
    const proj = (id) => {
      const n = nodes.find((k) => k.id === id);
      return n.x * dir.x + n.z * dir.z;
    };
    const geordend = leden.map((beam) => {
      const pa = proj(beam.from);
      const pb = proj(beam.to);
      return { beam, gespiegeld: pb < pa, pMin: Math.min(pa, pb) };
    }).sort((a, b) => a.pMin - b.pMin);
    const delen = [];
    const tussenknopen = [];
    let x = 0;
    for (let i = 0; i < geordend.length; i++) {
      const { beam, gespiegeld } = geordend[i];
      const lengteMm = beamLengthMm(beam, nodes);
      delen.push({ beam, gespiegeld, lengteMm, xStartMm: x });
      x += lengteMm;
      if (i > 0) tussenknopen.push(gespiegeld ? beam.to : beam.from);
    }
    const eerste = delen[0];
    const laatste = delen[delen.length - 1];
    const kandidaten = leden.filter((b) => teToetsen.has(b.id)).map((b) => b.id);
    lijnen.push({
      id: Math.min(...kandidaten.length > 0 ? kandidaten : leden.map((b) => b.id)),
      delen,
      tussenknopen,
      from: eerste.gespiegeld ? eerste.beam.to : eerste.beam.from,
      to: laatste.gespiegeld ? laatste.beam.from : laatste.beam.to,
      lengteMm: x
    });
  }
  return lijnen;
}
function eindVelden(obj, van, naar) {
  if (!obj) return void 0;
  const uit = {};
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith(van) || v === void 0) continue;
    uit[`${naar}${k.slice(van.length)}`] = v;
    n++;
  }
  return n > 0 ? uit : void 0;
}
function fractiesNaarLijn(fracties, deel, lengteMm) {
  if (!Array.isArray(fracties) || lengteMm <= 0) return [];
  const eigen = fracties.filter((f) => Number.isFinite(f) && f >= 0 && f <= 1);
  const inLijnrichting = deel.gespiegeld ? spiegelFracties(eigen) : eigen;
  return inLijnrichting.map((f) => Math.round((deel.xStartMm + f * deel.lengteMm) / lengteMm * 1e12) / 1e12);
}
function voegConfigSamen(lijn) {
  const configs = lijn.delen.map((d) => d.beam.checkConfig ?? {});
  const notities = [];
  const uit = {};
  const boven = /* @__PURE__ */ new Set();
  const onder = /* @__PURE__ */ new Set();
  for (const d of lijn.delen) {
    for (const f of fractiesNaarLijn(d.beam.checkConfig?.lateralRestraints, d, lijn.lengteMm)) boven.add(f);
    for (const f of fractiesNaarLijn(d.beam.checkConfig?.lateralRestraintsBottom, d, lijn.lengteMm)) onder.add(f);
  }
  if (boven.size > 0) uit.lateralRestraints = [...boven].sort((a, b) => a - b);
  if (onder.size > 0) uit.lateralRestraintsBottom = [...onder].sort((a, b) => a - b);
  const grootste = (sleutel, naam) => {
    const waarden = configs.map((c) => c[sleutel]).filter((v) => Number.isFinite(v) && v > 0);
    if (waarden.length === 0) return;
    const max = Math.max(...waarden);
    uit[sleutel] = max;
    if (new Set(waarden).size > 1) {
      notities.push(
        `De delen geven verschillende waarden voor ${naam} (${waarden.map((v) => nl2(v)).join(", ")} m); aangehouden is de grootste, ${nl2(max)} m \u2014 de ongunstigste.`
      );
    }
  };
  grootste("bucklingLengthY_m", "de kniklengte om de y-as");
  grootste("bucklingLengthZ_m", "de kniklengte om de z-as");
  grootste("ltbSupportSpacing_m", "de kipsteunafstand");
  const eerste = (sleutel, naam) => {
    const waarden = configs.map((c) => c[sleutel]).filter((v) => v !== void 0 && v !== null);
    if (waarden.length === 0) return;
    uit[sleutel] = waarden[0];
    if (new Set(waarden.map((v) => JSON.stringify(v))).size > 1) {
      notities.push(
        `De delen verschillen in ${naam}; aangehouden is de waarde van het eerste deel dat haar heeft gezet (${JSON.stringify(waarden[0])}).`
      );
    }
  };
  eerste("deflectionClass", "de doorbuigingsklasse");
  eerste("deflectionLimitNumerator", "de doorbuigingsnoemer");
  eerste("deflectionAddLimitNumerator", "de noemer van de bijkomende doorbuiging");
  eerste("serviceClass", "de klimaatklasse");
  eerste("loadDuration", "de belastingduurklasse");
  eerste("spanningSigmaZ", "de dwarsspanning");
  const zegen = configs.map((c) => c.preCamber_mm).filter((v) => Number.isFinite(v) && v !== 0);
  if (zegen.length > 0) {
    if (zegen.length === configs.length && new Set(zegen).size === 1) {
      uit.preCamber_mm = zegen[0];
    } else {
      notities.push(
        `Niet alle delen geven dezelfde zeeg (${zegen.map((v) => nl2(v, 1)).join(", ")} mm); de zeeg is voor de lijn op 0 gezet. Geef \xE9\xE9n zeeg op bij het deel waaronder de lijn wordt getoetst.`
      );
    }
  }
  return { config: Object.keys(uit).length > 0 ? uit : void 0, notities };
}
function voegElementKrachtenSamen(delen) {
  const efs = delen.map((d) => d.gespiegeld ? spiegelElementKrachten(d.ef) : d.ef);
  const stations_mm = [];
  const normalForce = [];
  const shearForce = [];
  const bendingMoment = [];
  const deflection = [];
  const axialDisp = [];
  const rotation = [];
  const metRotatie = efs.every((ef) => Array.isArray(ef.rotation) && ef.rotation.length === ef.stations_mm.length);
  let x0 = 0;
  efs.forEach((ef, i) => {
    const van = i > 0 ? 1 : 0;
    for (let k = van; k < ef.stations_mm.length; k++) {
      stations_mm.push(x0 + ef.stations_mm[k]);
      normalForce.push(ef.normalForce[k] ?? 0);
      shearForce.push(ef.shearForce[k] ?? 0);
      bendingMoment.push(ef.bendingMoment[k] ?? 0);
      deflection.push(ef.deflection[k] ?? 0);
      axialDisp.push(ef.axialDisp[k] ?? 0);
      if (metRotatie) rotation.push(ef.rotation[k]);
    }
    x0 += ef.L_mm;
  });
  const laatste = efs[efs.length - 1];
  const uit = {
    N: efs[0].N,
    V: efs[0].V,
    M_start: efs[0].M_start,
    M_end: laatste.M_end,
    L_mm: x0,
    stations_mm,
    normalForce,
    shearForce,
    bendingMoment,
    deflection,
    axialDisp
  };
  if (metRotatie) uit.rotation = rotation;
  return uit;
}
function virtueleStaaf(lijn) {
  const eerste = lijn.delen[0];
  const laatste = lijn.delen[lijn.delen.length - 1];
  const { config, notities } = voegConfigSamen(lijn);
  const beam = {
    ...eerste.beam,
    id: lijn.id,
    from: lijn.from,
    to: lijn.to
  };
  delete beam.releases;
  delete beam.veren;
  delete beam.checkConfig;
  const startRel = eindVelden(eerste.beam.releases, eerste.gespiegeld ? "end" : "start", "start");
  const endRel = eindVelden(laatste.beam.releases, laatste.gespiegeld ? "start" : "end", "end");
  if (startRel || endRel) beam.releases = { ...startRel ?? {}, ...endRel ?? {} };
  const startVeren = eindVelden(eerste.beam.veren, eerste.gespiegeld ? "end" : "start", "start");
  const endVeren = eindVelden(laatste.beam.veren, laatste.gespiegeld ? "start" : "end", "end");
  if (startVeren || endVeren) beam.veren = { ...startVeren ?? {}, ...endVeren ?? {} };
  if (config) beam.checkConfig = config;
  return { beam, notities };
}
function voegDoorgaandeLijnenSamen(invoer) {
  const alleBeams = invoer.alleBeams ?? invoer.beams;
  const lijnen = vindDoorgaandeLijnen(invoer.beams, invoer.nodes, alleBeams, invoer.supports);
  if (lijnen.length === 0) {
    return { data: invoer, lijnen: /* @__PURE__ */ new Map(), notities: /* @__PURE__ */ new Map(), overgeslagen: [] };
  }
  const vervangen = /* @__PURE__ */ new Set();
  const virtueel = [];
  const notities = /* @__PURE__ */ new Map();
  const lijnPerId = /* @__PURE__ */ new Map();
  const overgeslagen = [];
  const teToetsen = new Set(invoer.beams.map((b) => b.id));
  for (const lijn of lijnen) {
    const { beam, notities: configNotities } = virtueleStaaf(lijn);
    virtueel.push(beam);
    lijnPerId.set(lijn.id, lijn);
    const ids = lijn.delen.map((d) => d.beam.id);
    for (const id of ids) {
      vervangen.add(id);
      if (id !== lijn.id && teToetsen.has(id)) {
        overgeslagen.push({
          beamId: id,
          reason: `maakt deel uit van de doorgaande lijn die als staaf ${lijn.id} is getoetst (staven ${ids.join(", ")}, samen ${nl2(lijn.lengteMm / 1e3)} m); zie staaf ${lijn.id}`
        });
      }
    }
    const tekst = [
      `DOORGAANDE LIJN. Deze staaf is de doorgaande lijn van de staven ${ids.join(", ")} (${beam.profile ?? "\u2014"}, ${beam.material ?? "\u2014"}): zij liggen in elkaars verlengde, hebben dezelfde doorsnede en hetzelfde materiaal, en op de tussenknoop ${lijn.tussenknopen.join(", ")} staat geen oplegging. De toetsing beschouwt de lijn als \xC9\xC9N staaf van ${nl2(lijn.lengteMm / 1e3)} m: de terugval van de kniklengte, de kipvelden en de koorde van de doorbuiging gelden voor die hele lengte, en een tussenknoop telt niet als steun of als gaffel (basisaudit nr 29 en het kipgedrag bij een tussenknoop). Kipsteunen van de delen zijn omgerekend naar de lijn; een opgegeven kniklengte, kipsteunafstand, zeeg of klasse van een deel is voor de lijn overgenomen.`
    ];
    for (const knoop of lijn.tussenknopen) {
      const aangesloten = alleBeams.filter((b) => !vervangen.has(b.id) && !ids.includes(b.id) && (b.from === knoop || b.to === knoop)).map((b) => b.id);
      if (aangesloten.length > 0) {
        tekst.push(
          `Op tussenknoop ${knoop} sluit staaf ${aangesloten.join(", ")} aan. Die aansluiting is NIET als steun of gaffel meegeteld: een vlak model zegt niet of zij de lijn zijdelings of tegen torsie vasthoudt. Doet zij dat werkelijk, geef dan op die plaats een kipsteun (aan beide flenzen) of een kniklengte op.`
        );
      }
    }
    tekst.push(...configNotities);
    notities.set(lijn.id, tekst);
  }
  const beams = invoer.beams.filter((b) => !vervangen.has(b.id)).concat(virtueel);
  const combinationResults = /* @__PURE__ */ new Map();
  for (const [comboId, result] of invoer.combinationResults) {
    let elements = null;
    for (const lijn of lijnen) {
      const stukken = [];
      for (const d of lijn.delen) {
        const ef = result.elements.get(d.beam.id);
        if (!ef || ef.stations_mm.length === 0) break;
        stukken.push({ ef, gespiegeld: d.gespiegeld });
      }
      if (stukken.length !== lijn.delen.length) continue;
      elements ??= new Map(result.elements);
      elements.set(lijn.id, voegElementKrachtenSamen(stukken));
    }
    combinationResults.set(comboId, elements ? { ...result, elements } : result);
  }
  return {
    data: { ...invoer, beams, combinationResults },
    lijnen: lijnPerId,
    notities,
    overgeslagen
  };
}
function bepaalStaafeinden(beam, nodes, alleBeams, supports, ledenVanLijn, plates) {
  if (!supports) return { begin: "Gaffel", eind: "Gaffel" };
  const dir = richting(beam, nodes);
  const opgelegd = new Set(supports.map((s) => s.nodeId));
  const inPlaat = new Set((plates ?? []).flatMap((p) => p.nodeIds));
  const eind = (knoop) => {
    if (opgelegd.has(knoop) || inPlaat.has(knoop)) return "Gaffel";
    const anderen = alleBeams.filter(
      (b) => b.id !== beam.id && !ledenVanLijn.has(b.id) && (b.from === knoop || b.to === knoop)
    );
    if (anderen.length === 0) return "Vrij";
    const alleenInVerlengde = dir !== null && anderen.every((b) => {
      const d2 = richting(b, nodes);
      return d2 !== null && Math.abs(dir.x * d2.z - dir.z * d2.x) <= 1e-6;
    });
    return alleenInVerlengde ? "Doorlopend" : "Gaffel";
  };
  return { begin: eind(beam.from), eind: eind(beam.to) };
}

// src/components/fem/solver/alphaCr.ts
var ALPHA_CR_GRENS_EERSTE_ORDE = 10;
var ALPHA_CR_ZOEKGRENS = 100;
var ALPHA_CR_MAX_DOFS = 1500;
function normaalkrachtOp(ef, xMm) {
  const xs = ef.stations_mm;
  const ns = ef.normalForce;
  if (xs.length === 0) return ef.N;
  if (xMm <= xs[0]) return ns[0] ?? 0;
  for (let i = 1; i < xs.length; i++) {
    if (xMm <= xs[i]) {
      const t = xs[i] === xs[i - 1] ? 0 : (xMm - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return (ns[i - 1] ?? 0) + t * ((ns[i] ?? 0) - (ns[i - 1] ?? 0));
    }
  }
  return ns[ns.length - 1] ?? 0;
}
function bepaalAlphaCr(input, combinaties, combinationResults, opties = {}) {
  const maxDofs = opties.maxDofs ?? ALPHA_CR_MAX_DOFS;
  const uls = combinaties.filter((c) => c.type === "uls");
  if (uls.length === 0) return [];
  const nietBepaald = (reden) => uls.map((c) => ({ combinatieId: c.id, naam: c.name, alphaCr: null, status: "niet_bepaald", reden }));
  if (input.plates && input.plates.length > 0) {
    return nietBepaald(
      "het model bevat wandschijven; de kritieke lastfactor van het gemengde staaf-schijfstelsel wordt hier niet bepaald"
    );
  }
  const fijner = {
    ...input,
    beams: input.beams.map((b) => ({
      ...b,
      extraSneden: [.../* @__PURE__ */ new Set([...b.extraSneden ?? [], 0.5])]
    }))
  };
  const gebouwd = buildMesh(fijner, () => 0);
  const mesh = gebouwd.mesh;
  const numDofs = mesh.getNodeCount() * 3;
  if (numDofs > maxDofs) {
    return nietBepaald(
      `het model heeft na de verdeling in elementen ${numDofs} vrijheidsgraden, meer dan de ${maxDofs} waarvoor de directe bepaling van \u03B1_cr is bedoeld`
    );
  }
  const nul = new Array(numDofs).fill(0);
  const uit = [];
  for (const combo of uls) {
    const res = combinationResults.get(combo.id);
    if (!res) {
      uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "niet_bepaald", reden: "geen combinatieresultaat" });
      continue;
    }
    const axiaal = /* @__PURE__ */ new Map();
    let druk = false;
    for (const [uiId, eersteMeshId] of gebouwd.beamIdMap) {
      const ef = res.elements.get(uiId);
      if (!ef) continue;
      const segs = gebouwd.beamSegments.get(uiId) ?? [{ meshId: eersteMeshId, t0: 0, t1: 1 }];
      for (const seg of segs) {
        const n = normaalkrachtOp(ef, (seg.t0 + seg.t1) / 2 * ef.L_mm);
        if (n < -1e-9) druk = true;
        axiaal.set(seg.meshId, -n);
      }
    }
    if (!druk) {
      uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "geen_druk" });
      continue;
    }
    const instabiel = (alpha) => {
      const geschaald = /* @__PURE__ */ new Map();
      for (const [id, n] of axiaal) geschaald.set(id, n * alpha);
      const k = assembleGlobalStiffnessWithGeometric(mesh, geschaald, true);
      const { K } = applyBoundaryConditions(k, nul, mesh);
      return countNonPositivePivots(K) > 0;
    };
    if (instabiel(1e-9)) {
      uit.push({
        combinatieId: combo.id,
        naam: combo.name,
        alphaCr: null,
        status: "niet_bepaald",
        reden: "het stelsel is zonder normaalkracht al niet positief definiet (mechanisme of ontbrekende oplegging)"
      });
      continue;
    }
    let laag;
    let hoog;
    if (!instabiel(ALPHA_CR_GRENS_EERSTE_ORDE)) {
      if (!instabiel(ALPHA_CR_ZOEKGRENS)) {
        uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: null, status: "boven_grens", grens: ALPHA_CR_ZOEKGRENS });
        continue;
      }
      laag = ALPHA_CR_GRENS_EERSTE_ORDE;
      hoog = ALPHA_CR_ZOEKGRENS;
    } else {
      laag = 0;
      hoog = ALPHA_CR_GRENS_EERSTE_ORDE;
    }
    for (let i = 0; i < 16; i++) {
      const mid = (laag + hoog) / 2;
      if (instabiel(mid)) hoog = mid;
      else laag = mid;
    }
    uit.push({ combinatieId: combo.id, naam: combo.name, alphaCr: (laag + hoog) / 2, status: "bepaald" });
  }
  return uit;
}
var nl3 = (v, d = 2) => v.toFixed(d).replace(".", ",");
function alphaCrLabel(u) {
  switch (u.status) {
    case "bepaald":
      return `\u03B1_cr = ${nl3(u.alphaCr ?? NaN)}`;
    case "boven_grens":
      return `\u03B1_cr > ${u.grens ?? ALPHA_CR_ZOEKGRENS}`;
    case "geen_druk":
      return "geen staaf onder druk";
    default:
      return `\u03B1_cr niet bepaald (${u.reden ?? "onbekende reden"})`;
  }
}
function stabiliteitsMeldingen(uitkomsten, analysetype, scheefstandAan) {
  const meldingen = [];
  const eersteOrde = analysetype === "eersteOrde";
  const teLaag = uitkomsten.filter(
    (u) => u.status === "bepaald" && (u.alphaCr ?? Infinity) < ALPHA_CR_GRENS_EERSTE_ORDE
  );
  if (teLaag.length > 0) {
    const laagste = teLaag.reduce((a, b) => (b.alphaCr ?? Infinity) < (a.alphaCr ?? Infinity) ? b : a);
    const lijst = teLaag.map((u) => `${nl3(u.alphaCr ?? NaN)} ("${u.naam}")`).join(", ");
    if (eersteOrde) {
      meldingen.push({
        niveau: "fout",
        tekst: `EERSTE ORDE NIET TOEGESTAAN: \u03B1_cr = ${nl3(laagste.alphaCr ?? NaN)} in combinatie "${laagste.naam}" is kleiner dan ${ALPHA_CR_GRENS_EERSTE_ORDE}` + (teLaag.length > 1 ? ` (alle combinaties onder de grens: ${lijst})` : "") + ". NEN-EN 1993-1-1 5.2.1(3) staat een eerste-orde-berekening dan niet toe: de tweede-orde-effecten (P-\u0394) zijn niet verwaarloosbaar, en de terugval van de kniklengte op de systeemlengte in de staaftoets veronderstelt juist krachten uit een tweede-orde-berekening met imperfecties (5.2.2(7)b). De krachten en de unity checks van deze berekening zijn daarom NIET bruikbaar als toetsing. Kies het analysetype tweede orde (P-\u0394) met de scheefstand aan, of geef per op druk belaste staaf de kniklengte uit de zijdelingse knikvorm op (5.2.2(8))."
      });
    } else if (!scheefstandAan) {
      meldingen.push({
        niveau: "waarschuwing",
        tekst: `\u03B1_cr = ${nl3(laagste.alphaCr ?? NaN)} in combinatie "${laagste.naam}" (< ${ALPHA_CR_GRENS_EERSTE_ORDE}): de tweede-orde-berekening dekt de vergroting, maar zij rekent ZONDER scheefstand. NEN-EN 1993-1-1 5.2.2(3) en 5.3.2 eisen de imperfecties in de tweede-orde-berekening; zet de scheefstand aan.`
      });
    } else {
      meldingen.push({
        niveau: "info",
        tekst: `\u03B1_cr = ${nl3(laagste.alphaCr ?? NaN)} in combinatie "${laagste.naam}" (< ${ALPHA_CR_GRENS_EERSTE_ORDE}): tweede orde met scheefstand \u2014 de route van NEN-EN 1993-1-1 5.2.2(3)a/5.2.2(7)b; de kniklengte-terugval op de systeemlengte in de staaftoets is dan toegestaan.`
      });
    }
  }
  const nietBepaald = uitkomsten.filter((u) => u.status === "niet_bepaald");
  if (nietBepaald.length > 0 && eersteOrde) {
    const redenen = [...new Set(nietBepaald.map((u) => u.reden ?? "onbekende reden"))].join("; ");
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `\u03B1_cr is voor ${nietBepaald.length} combinatie(s) niet bepaald (${redenen}). De voorwaarde \u03B1_cr \u2265 ${ALPHA_CR_GRENS_EERSTE_ORDE} voor een eerste-orde-berekening (NEN-EN 1993-1-1 5.2.1(3)) is daar dus niet gecontroleerd.`
    });
  }
  return meldingen;
}
function analyseToelichting(analysetype, label, omschrijving, uitkomsten, scheefstandAan) {
  const regels = [];
  regels.push(`Analysetype: ${label}. ${omschrijving}`);
  regels.push("");
  if (uitkomsten.length === 0) {
    regels.push("Kritieke lastfactor \u03B1_cr: geen UGT-combinaties doorgerekend.");
  } else {
    regels.push(
      "Kritieke lastfactor \u03B1_cr per UGT-combinatie (NEN-EN 1993-1-1 5.2.1(3)): de factor op de belasting van de combinatie waarbij K_e + \u03B1\xB7K_g(N_Ed) singulier wordt \u2014 de laagste knikvorm van het vlakke raamwerk met de normaalkrachten van die combinatie, elke staaf in twee elementen. Alleen knik in het vlak; knik uit het vlak blijft de zaak van de staaftoets."
    );
    for (const u of uitkomsten) regels.push(`    ${alphaCrLabel(u)}   [${u.naam}]`);
    regels.push(
      `Eerste orde is toegestaan wanneer \u03B1_cr \u2265 ${ALPHA_CR_GRENS_EERSTE_ORDE} (5.2.1(3)); daaronder moeten de tweede-orde-effecten in de berekening zitten, met de imperfecties van 5.3.`
    );
  }
  const meldingen = stabiliteitsMeldingen(uitkomsten, analysetype, scheefstandAan);
  if (meldingen.length > 0) {
    regels.push("");
    for (const m of meldingen) regels.push(m.niveau === "info" ? m.tekst : `! ${m.tekst}`);
  }
  return regels.join("\n");
}
function alphaCrStaafNotitie(stabiliteit, nEdMinKn, kniklengteYOpgegeven) {
  if (!stabiliteit || stabiliteit.analysetype !== "eersteOrde") return null;
  if (!(nEdMinKn < 0) || kniklengteYOpgegeven) return null;
  const teLaag = stabiliteit.alphaCr.filter(
    (u) => u.status === "bepaald" && (u.alphaCr ?? Infinity) < ALPHA_CR_GRENS_EERSTE_ORDE
  );
  if (teLaag.length === 0) return null;
  const laagste = teLaag.reduce((a, b) => (b.alphaCr ?? Infinity) < (a.alphaCr ?? Infinity) ? b : a);
  return `EERSTE ORDE MET \u03B1_cr = ${nl3(laagste.alphaCr ?? NaN)} (combinatie "${laagste.naam}") < ${ALPHA_CR_GRENS_EERSTE_ORDE}: deze staaf staat onder druk en de kniklengte in het vlak valt terug op de systeemlengte. NEN-EN 1993-1-1 5.2.2(7)b staat die terugval alleen toe bij krachten uit een tweede-orde-berekening met imperfecties, en 5.2.1(3) staat eerste orde bij \u03B1_cr < 10 niet toe. De knikweerstand om de y-as hieronder is daarom NIET normconform bepaald: kies tweede orde (P-\u0394) met scheefstand, of geef L_cr,y uit de zijdelingse knikvorm op (5.2.2(8)).`;
}

// src/lib/steelSections.generated.ts
var STEEL_SECTIONS = {
  "UNP350": { A: 7665.7, Iy: 126942139 },
  "HFRHS200X200X16": { A: 11501.3, Iy: 63935400 },
  "IPE80": { A: 764, Iy: 801e3 },
  "IPE100": { A: 1030, Iy: 171e4 },
  "IPE120": { A: 1320, Iy: 318e4 },
  "IPE140": { A: 1639.9999999999998, Iy: 541e4 },
  "IPE160": { A: 2010.0000000000002, Iy: 869e4 },
  "IPE180": { A: 2390, Iy: 132e5 },
  "IPE200": { A: 2850, Iy: 194e5 },
  "IPE220": { A: 3340, Iy: 277e5 },
  "IPE240": { A: 3910, Iy: 389e5 },
  "IPE270": { A: 4590, Iy: 579e5 },
  "IPE300": { A: 5380, Iy: 836e5 },
  "IPE330": { A: 6260, Iy: 1177e5 },
  "IPE360": { A: 7270, Iy: 1627e5 },
  "IPE400": { A: 8450, Iy: 2313e5 },
  "IPE450": { A: 9880, Iy: 3374e5 },
  "IPE500": { A: 11600, Iy: 482e6 },
  "IPE550": { A: 13400, Iy: 6712e5 },
  "IPE600": { A: 15600, Iy: 9208e5 },
  "HEA100": { A: 2120, Iy: 349e4 },
  "HEA120": { A: 2530, Iy: 606e4 },
  "HEA140": { A: 3140, Iy: 103e5 },
  "HEA160": { A: 3879.9999999999995, Iy: 167e5 },
  "HEA180": { A: 4530, Iy: 251e5 },
  "HEA200": { A: 5380, Iy: 369e5 },
  "HEA220": { A: 6430, Iy: 541e5 },
  "HEA240": { A: 7680, Iy: 776e5 },
  "HEA260": { A: 8680, Iy: 1045e5 },
  "HEA280": { A: 9730, Iy: 1367e5 },
  "HEA300": { A: 11200, Iy: 1826e5 },
  "HEA320": { A: 12438.9, Iy: 229321969 },
  "HEA340": { A: 13350, Iy: 2769e5 },
  "HEA360": { A: 14280.000000000002, Iy: 3309e5 },
  "HEA400": { A: 15900, Iy: 45075e4 },
  "HEB100": { A: 2600, Iy: 45e5 },
  "HEB120": { A: 3400, Iy: 864e4 },
  "HEB140": { A: 4300, Iy: 151e5 },
  "HEB160": { A: 5430, Iy: 249e5 },
  "HEB180": { A: 6530, Iy: 383e5 },
  "HEB200": { A: 7809.999999999999, Iy: 57e6 },
  "HEB220": { A: 9100, Iy: 809e5 },
  "HEB240": { A: 10600, Iy: 1126e5 },
  "HEB260": { A: 11800, Iy: 1492e5 },
  "HEB280": { A: 13100, Iy: 1927e5 },
  "HEB300": { A: 14900, Iy: 2517e5 },
  "HEB320": { A: 16130.000000000002, Iy: 3082e5 },
  "HEB340": { A: 17090, Iy: 3666e5 },
  "HEB360": { A: 18060, Iy: 4319e5 },
  "HEB400": { A: 19780, Iy: 5768e5 },
  "HEM100": { A: 5320, Iy: 114e5 },
  "HEM120": { A: 6640.000000000001, Iy: 202e5 },
  "HEM140": { A: 8059.999999999999, Iy: 329e5 },
  "HEM160": { A: 9710, Iy: 51e6 },
  "HEM180": { A: 11300, Iy: 748e5 },
  "HEM200": { A: 13100, Iy: 1064e5 },
  "HEM220": { A: 14900, Iy: 146e6 },
  "HEM240": { A: 2e4, Iy: 2429e5 },
  "HEM260": { A: 22e3, Iy: 3131e5 },
  "HEM280": { A: 24e3, Iy: 3955e5 },
  "HEM300": { A: 30300, Iy: 592e6 },
  "SHS80X80X4": { A: 1198.83, Iy: 1144550 },
  "SHS100X100X5": { A: 1873.17, Iy: 2794320 },
  "SHS120X120X5": { A: 2273.17, Iy: 4977140 },
  "SHS150X150X6": { A: 3417.37, Iy: 11735600 },
  "SHS200X200X8": { A: 6075.33, Iy: 37090100 },
  "SHS250X250X10": { A: 9492.7, Iy: 90552100 },
  "SHS300X300X10": { A: 11492.7, Iy: 160261e3 },
  "RHS100X50X4": { A: 1118.83, Iy: 1396e3 },
  "RHS120X60X5": { A: 1673.17, Iy: 2992140 },
  "RHS150X100X6": { A: 2817.37, Iy: 8623350 },
  "RHS200X100X8": { A: 4475.33, Iy: 22336e3 },
  "RHS250X150X8": { A: 6075.33, Iy: 51114300 },
  "RHS300X200X10": { A: 9492.7, Iy: 118194e3 },
  "CHS424X32": { A: 394.081, Iy: 76199.6 },
  "CHS483X32": { A: 453.395, Iy: 115857 },
  "CHS603X40": { A: 707.487, Iy: 281729 },
  "CHS761X50": { A: 1116.84, Iy: 709220 },
  "CHS889X50": { A: 1317.9, Iy: 1163740 },
  "CHS1143X63": { A: 2137.54, Iy: 3127140 },
  "CHS1397X80": { A: 3309.98, Iy: 7202890 },
  "CHS1683X80": { A: 4028.78, Iy: 12972700 },
  "CHS2191X10": { A: 6569.07, Iy: 35984400 },
  "CHS273X10": { A: 8262.39, Iy: 71540900 },
  "CHS3239X125": { A: 12228.6, Iy: 148465e3 },
  "CHS4064X16": { A: 19623.6, Iy: 374488e3 },
  "UNP80": { A: 1102.34, Iy: 1059300 },
  "UNP100": { A: 1346.14, Iy: 2055030 },
  "UNP120": { A: 1698.71, Iy: 3643290 },
  "UNP140": { A: 2036.98, Iy: 6048140 },
  "UNP160": { A: 2402.39, Iy: 9252630 },
  "UNP180": { A: 2796.57, Iy: 13539100 },
  "UNP200": { A: 3219.53, Iy: 19118100 },
  "UNP220": { A: 3745.53, Iy: 26923400 },
  "UNP240": { A: 4230.67, Iy: 35988100 },
  "UNP260": { A: 4828.25, Iy: 48242e3 },
  "UNP280": { A: 5341.98, Iy: 62759100 },
  "UNP300": { A: 5876.24, Iy: 80276700 },
  "HEA450": { A: 17802.8, Iy: 637216e3 },
  "HEA500": { A: 19753.8, Iy: 869748e3 },
  "HEA550": { A: 21175.8, Iy: 111932e4 },
  "HEA600": { A: 22645.8, Iy: 141208e4 },
  "HEA650": { A: 24163.8, Iy: 175178e4 },
  "HEA700": { A: 26047.8, Iy: 215301e4 },
  "HEA800": { A: 28582.6, Iy: 303443e4 },
  "HEA900": { A: 32052.6, Iy: 422075e4 },
  "HEA1000": { A: 34684.6, Iy: 553846e4 },
  "HEB450": { A: 21797.8, Iy: 798876e3 },
  "HEB500": { A: 23863.8, Iy: 107176e4 },
  "HEB550": { A: 25405.8, Iy: 136691e4 },
  "HEB600": { A: 26995.8, Iy: 171041e4 },
  "HEB650": { A: 28633.8, Iy: 210616e4 },
  "HEB700": { A: 30637.8, Iy: 256888e4 },
  "HEB800": { A: 33417.6, Iy: 359084e4 },
  "HEB900": { A: 37127.6, Iy: 494065e4 },
  "HEB1000": { A: 40004.6, Iy: 644748e4 },
  "HEM320": { A: 31204.8, Iy: 681349e3 },
  "HEM340": { A: 31582.8, Iy: 763717e3 },
  "HEM360": { A: 31880.8, Iy: 84867e4 },
  "HEM400": { A: 32577.8, Iy: 104119e4 },
  "HEM450": { A: 33543.8, Iy: 131484e4 },
  "HEM500": { A: 34429.8, Iy: 161929e4 },
  "HEM550": { A: 35437.8, Iy: 197984e4 },
  "HEM600": { A: 36365.8, Iy: 237448e4 },
  "HEM650": { A: 37373.8, Iy: 281668e4 },
  "HEM700": { A: 38301.8, Iy: 329278e4 },
  "HEM800": { A: 40426.6, Iy: 442598e4 },
  "HEM900": { A: 42362.6, Iy: 570434e4 },
  "HEM1000": { A: 44420.6, Iy: 722299e4 },
  "UPE80": { A: 1006.92, Iy: 1072040 },
  "UPE100": { A: 1250.42, Iy: 2068630 },
  "UPE120": { A: 1541.81, Iy: 3635020 },
  "UPE140": { A: 1841.81, Iy: 5994620 },
  "UPE160": { A: 2167.31, Iy: 9110610 },
  "UPE180": { A: 2511.31, Iy: 13534400 },
  "UPE200": { A: 2900.54, Iy: 19093e3 },
  "UPE220": { A: 3386.54, Iy: 26824e3 },
  "UPE240": { A: 3851.57, Iy: 35987900 },
  "UPE270": { A: 4484.07, Iy: 52545100 },
  "UPE300": { A: 5661.57, Iy: 78231900 },
  "UPE330": { A: 6777.06, Iy: 110075e3 },
  "UPE360": { A: 7791.06, Iy: 148254e3 },
  "UPE400": { A: 9193.06, Iy: 209807e3 },
  "SHS40X40X3": { A: 434.343, Iy: 97750.5 },
  "SHS40X40X4": { A: 558.832, Iy: 118295 },
  "SHS40X40X5": { A: 673.175, Iy: 133679 },
  "SHS50X50X3": { A: 554.343, Iy: 201989 },
  "SHS50X50X4": { A: 718.832, Iy: 249748 },
  "SHS50X50X5": { A: 873.175, Iy: 288806 },
  "SHS50X50X63": { A: 1058.65, Iy: 327622 },
  "SHS60X60X3": { A: 674.343, Iy: 362144 },
  "SHS60X60X4": { A: 878.832, Iy: 453942 },
  "SHS60X60X5": { A: 1073.17, Iy: 532592 },
  "SHS60X60X63": { A: 1310.65, Iy: 616453 },
  "SHS60X60X8": { A: 1595.33, Iy: 697344 },
  "SHS70X70X36": { A: 942.254, Iy: 686485 },
  "SHS70X70X4": { A: 1038.83, Iy: 746877 },
  "SHS70X70X5": { A: 1273.17, Iy: 885037 },
  "SHS70X70X63": { A: 1562.65, Iy: 1038480 },
  "SHS70X70X8": { A: 1915.33, Iy: 1197550 },
  "SHS80X80X36": { A: 1086.25, Iy: 1049050 },
  "SHS80X80X5": { A: 1473.17, Iy: 1366140 },
  "SHS80X80X63": { A: 1814.65, Iy: 1618900 },
  "SHS80X80X8": { A: 2235.33, Iy: 1892720 },
  "SHS80X80X10": { A: 2692.7, Iy: 2138860 },
  "SHS90X90X4": { A: 1358.83, Iy: 1662970 },
  "SHS90X90X5": { A: 1673.17, Iy: 1995900 },
  "SHS90X90X63": { A: 2066.65, Iy: 2382910 },
  "SHS90X90X8": { A: 2555.33, Iy: 2814860 },
  "SHS90X90X10": { A: 3092.7, Iy: 3222560 },
  "SHS100X100X4": { A: 1518.83, Iy: 2318130 },
  "SHS100X100X63": { A: 2318.65, Iy: 3355720 },
  "SHS100X100X8": { A: 2875.33, Iy: 3995960 },
  "SHS100X100X10": { A: 3492.7, Iy: 4620900 },
  "SHS100X100X125": { A: 4207.34, Iy: 5221830 },
  "SHS120X120X63": { A: 2822.65, Iy: 6028520 },
  "SHS120X120X8": { A: 3515.33, Iy: 7263070 },
  "SHS120X120X10": { A: 4292.7, Iy: 8521470 },
  "SHS120X120X125": { A: 5207.34, Iy: 9817500 },
  "SHS140X140X5": { A: 2673.17, Iy: 8074590 },
  "SHS140X140X63": { A: 3326.65, Iy: 9838900 },
  "SHS140X140X8": { A: 4155.33, Iy: 1195e4 },
  "SHS140X140X10": { A: 5092.7, Iy: 14160600 },
  "SHS140X140X125": { A: 6207.34, Iy: 16529600 },
  "SHS150X150X5": { A: 2873.17, Iy: 10016300 },
  "SHS150X150X63": { A: 3578.65, Iy: 12233700 },
  "SHS150X150X8": { A: 4475.33, Iy: 14906e3 },
  "SHS150X150X10": { A: 5492.7, Iy: 17732100 },
  "SHS150X150X125": { A: 6707.34, Iy: 20804400 },
  "SHS150X150X16": { A: 8301.31, Iy: 24300200 },
  "SHS160X160X63": { A: 3830.65, Iy: 14988500 },
  "SHS160X160X8": { A: 4795.33, Iy: 18312900 },
  "SHS160X160X10": { A: 5892.7, Iy: 21858200 },
  "SHS160X160X125": { A: 7207.34, Iy: 25758200 },
  "SHS160X160X16": { A: 8941.31, Iy: 30283500 },
  "SHS180X180X63": { A: 4334.65, Iy: 21678800 },
  "SHS180X180X8": { A: 5435.33, Iy: 26607600 },
  "SHS180X180X10": { A: 6692.7, Iy: 31934400 },
  "SHS180X180X125": { A: 8207.34, Iy: 37903300 },
  "SHS180X180X16": { A: 10221.3, Iy: 45037700 },
  "SHS200X200X63": { A: 4838.65, Iy: 30111500 },
  "SHS200X200X10": { A: 7492.7, Iy: 44709200 },
  "SHS200X200X125": { A: 9207.34, Iy: 53364900 },
  "SHS200X200X20": { A: 13970.8, Iy: 73934400 },
  "SHS220X220X8": { A: 6715.33, Iy: 50016600 },
  "SHS220X220X10": { A: 8292.7, Iy: 60502400 },
  "SHS220X220X125": { A: 10207.3, Iy: 72542900 },
  "SHS220X220X16": { A: 12781.3, Iy: 87488500 },
  "SHS250X250X63": { A: 6098.65, Iy: 60139200 },
  "SHS250X250X8": { A: 7675.33, Iy: 74548500 },
  "SHS250X250X125": { A: 11707.3, Iy: 109153e3 },
  "SHS250X250X16": { A: 14701.3, Iy: 132667e3 },
  "SHS250X250X20": { A: 17970.8, Iy: 156092e3 },
  "SHS260X260X8": { A: 7995.33, Iy: 84225e3 },
  "SHS260X260X10": { A: 9892.7, Iy: 102425e3 },
  "SHS260X260X125": { A: 12207.3, Iy: 123648e3 },
  "SHS260X260X16": { A: 15341.3, Iy: 150609e3 },
  "SHS300X300X8": { A: 9275.33, Iy: 131281e3 },
  "SHS300X300X125": { A: 14207.3, Iy: 19442e4 },
  "SHS300X300X16": { A: 17901.3, Iy: 238496e3 },
  "SHS300X300X20": { A: 21970.8, Iy: 283714e3 },
  "SHS350X350X8": { A: 10875.3, Iy: 211288e3 },
  "SHS350X350X10": { A: 13492.7, Iy: 258836e3 },
  "SHS350X350X125": { A: 16707.3, Iy: 315414e3 },
  "SHS350X350X16": { A: 21101.3, Iy: 389421e3 },
  "SHS350X350X20": { A: 25970.8, Iy: 466798e3 },
  "SHS400X400X10": { A: 15492.7, Iy: 391276e3 },
  "SHS400X400X125": { A: 19207.3, Iy: 478386e3 },
  "SHS400X400X16": { A: 24301.3, Iy: 593442e3 },
  "SHS400X400X20": { A: 29970.8, Iy: 715347e3 },
  "RHS50X30X3": { A: 434.343, Iy: 135629 },
  "RHS50X30X32": { A: 460.052, Iy: 142071 },
  "RHS50X30X4": { A: 558.832, Iy: 164894 },
  "RHS50X30X5": { A: 673.175, Iy: 187139 },
  "RHS60X40X3": { A: 554.343, Iy: 264584 },
  "RHS60X40X32": { A: 588.052, Iy: 278244 },
  "RHS60X40X4": { A: 718.832, Iy: 328288 },
  "RHS60X40X5": { A: 873.175, Iy: 380925 },
  "RHS60X40X63": { A: 1058.65, Iy: 433947 },
  "RHS70X50X3": { A: 674.343, Iy: 455457 },
  "RHS70X50X36": { A: 798.254, Iy: 527607 },
  "RHS70X50X4": { A: 878.832, Iy: 572424 },
  "RHS70X50X5": { A: 1073.17, Iy: 673370 },
  "RHS70X50X63": { A: 1310.65, Iy: 782010 },
  "RHS80X40X3": { A: 674.343, Iy: 542287 },
  "RHS80X40X32": { A: 716.052, Iy: 571802 },
  "RHS80X40X4": { A: 878.832, Iy: 682048 },
  "RHS80X40X5": { A: 1073.17, Iy: 802807 },
  "RHS80X40X63": { A: 1310.65, Iy: 932838 },
  "RHS80X40X8": { A: 1595.33, Iy: 1059870 },
  "RHS90X50X36": { A: 942.254, Iy: 983140 },
  "RHS90X50X4": { A: 1038.83, Iy: 1070870 },
  "RHS90X50X5": { A: 1273.17, Iy: 1272570 },
  "RHS90X50X63": { A: 1562.65, Iy: 1498530 },
  "RHS90X50X8": { A: 1915.33, Iy: 1735600 },
  "RHS100X50X3": { A: 854.343, Iy: 1096040 },
  "RHS100X50X32": { A: 908.052, Iy: 1158550 },
  "RHS100X50X5": { A: 1373.17, Iy: 1665160 },
  "RHS100X50X63": { A: 1688.65, Iy: 1970840 },
  "RHS100X50X8": { A: 2075.33, Iy: 2298890 },
  "RHS100X60X36": { A: 1086.25, Iy: 1447130 },
  "RHS100X60X4": { A: 1198.83, Iy: 1580430 },
  "RHS100X60X5": { A: 1473.17, Iy: 1890990 },
  "RHS100X60X63": { A: 1814.65, Iy: 2247810 },
  "RHS100X60X8": { A: 2235.33, Iy: 2638310 },
  "RHS120X60X36": { A: 1230.25, Iy: 2272740 },
  "RHS120X60X4": { A: 1358.83, Iy: 2487320 },
  "RHS120X60X63": { A: 2066.65, Iy: 3582690 },
  "RHS120X60X8": { A: 2555.33, Iy: 4247390 },
  "RHS120X60X10": { A: 3092.7, Iy: 4881470 },
  "RHS120X80X4": { A: 1518.83, Iy: 3025770 },
  "RHS120X80X5": { A: 1873.17, Iy: 3653810 },
  "RHS120X80X63": { A: 2318.65, Iy: 4397970 },
  "RHS120X80X8": { A: 2875.33, Iy: 5252610 },
  "RHS120X80X10": { A: 3492.7, Iy: 6094810 },
  "RHS140X80X4": { A: 1678.83, Iy: 4406030 },
  "RHS140X80X5": { A: 2073.17, Iy: 5339590 },
  "RHS140X80X63": { A: 2570.65, Iy: 6457900 },
  "RHS140X80X8": { A: 3195.33, Iy: 7763160 },
  "RHS140X80X10": { A: 3892.7, Iy: 9080590 },
  "RHS150X100X4": { A: 1918.83, Iy: 6072930 },
  "RHS150X100X5": { A: 2373.17, Iy: 7387140 },
  "RHS150X100X63": { A: 2948.65, Iy: 8979280 },
  "RHS150X100X8": { A: 3675.33, Iy: 10868900 },
  "RHS150X100X10": { A: 4492.7, Iy: 12823800 },
  "RHS150X100X125": { A: 5457.34, Iy: 14879900 },
  "RHS160X80X4": { A: 1838.83, Iy: 6122060 },
  "RHS160X80X5": { A: 2273.17, Iy: 7440020 },
  "RHS160X80X63": { A: 2822.65, Iy: 9031960 },
  "RHS160X80X8": { A: 3515.33, Iy: 10912800 },
  "RHS160X80X10": { A: 4292.7, Iy: 12844900 },
  "RHS160X80X125": { A: 5207.34, Iy: 14854100 },
  "RHS180X100X5": { A: 2673.17, Iy: 11526700 },
  "RHS180X100X63": { A: 3326.65, Iy: 14072200 },
  "RHS180X100X8": { A: 4155.33, Iy: 17133900 },
  "RHS180X100X10": { A: 5092.7, Iy: 20361100 },
  "RHS180X100X125": { A: 6207.34, Iy: 23849100 },
  "RHS200X100X5": { A: 2873.17, Iy: 14946400 },
  "RHS200X100X63": { A: 3578.65, Iy: 18288600 },
  "RHS200X100X10": { A: 5492.7, Iy: 26642500 },
  "RHS200X100X125": { A: 6707.34, Iy: 31359600 },
  "RHS200X100X16": { A: 8301.31, Iy: 36782300 },
  "RHS200X120X63": { A: 3830.65, Iy: 20653200 },
  "RHS200X120X8": { A: 4795.33, Iy: 25286800 },
  "RHS200X120X10": { A: 5892.7, Iy: 30255800 },
  "RHS200X120X125": { A: 7207.34, Iy: 35760700 },
  "RHS250X150X63": { A: 4838.65, Iy: 41427300 },
  "RHS250X150X10": { A: 7492.7, Iy: 61735500 },
  "RHS250X150X125": { A: 9207.34, Iy: 73866800 },
  "RHS250X150X16": { A: 11501.3, Iy: 88794100 },
  "RHS260X180X8": { A: 6715.33, Iy: 63896900 },
  "RHS260X180X10": { A: 8292.7, Iy: 77411300 },
  "RHS260X180X125": { A: 10207.3, Iy: 92994100 },
  "RHS260X180X16": { A: 12781.3, Iy: 112451e3 },
  "RHS300X200X63": { A: 6098.65, Iy: 78290800 },
  "RHS300X200X8": { A: 7675.33, Iy: 97166800 },
  "RHS300X200X125": { A: 11707.3, Iy: 142727e3 },
  "RHS300X200X16": { A: 14701.3, Iy: 173903e3 },
  "RHS350X250X8": { A: 9275.33, Iy: 164493e3 },
  "RHS350X250X10": { A: 11492.7, Iy: 201019e3 },
  "RHS350X250X125": { A: 14207.3, Iy: 24419e4 },
  "RHS350X250X16": { A: 17901.3, Iy: 300108e3 },
  "RHS400X200X8": { A: 9275.33, Iy: 19562e4 },
  "RHS400X200X10": { A: 11492.7, Iy: 239143e3 },
  "RHS400X200X125": { A: 14207.3, Iy: 290626e3 },
  "RHS400X200X16": { A: 17901.3, Iy: 357376e3 },
  "RHS400X200X20": { A: 21970.8, Iy: 42628e4 },
  "RHS450X250X8": { A: 10875.3, Iy: 300815e3 },
  "RHS450X250X10": { A: 13492.7, Iy: 368949e3 },
  "RHS450X250X125": { A: 16707.3, Iy: 450263e3 },
  "RHS450X250X16": { A: 21101.3, Iy: 557055e3 },
  "RHS450X250X20": { A: 25970.8, Iy: 669292e3 },
  "RHS500X300X10": { A: 15492.7, Iy: 537622e3 },
  "RHS500X300X125": { A: 19207.3, Iy: 658129e3 },
  "RHS500X300X16": { A: 24301.3, Iy: 81783e4 },
  "RHS500X300X20": { A: 29970.8, Iy: 987767e3 },
  "CHS337X26": { A: 254.029, Iy: 30927.1 },
  "CHS337X32": { A: 306.619, Iy: 36046.6 },
  "CHS337X4": { A: 373.221, Iy: 41898.3 },
  "CHS424X26": { A: 325.092, Iy: 64644.5 },
  "CHS424X4": { A: 482.549, Iy: 89908.5 },
  "CHS483X4": { A: 556.69, Iy: 137676 },
  "CHS483X5": { A: 680.155, Iy: 161527 },
  "CHS603X32": { A: 574.032, Iy: 234682 },
  "CHS603X5": { A: 868.65, Iy: 334766 },
  "CHS603X63": { A: 1068.77, Iy: 394869 },
  "CHS761X32": { A: 732.871, Iy: 487785 },
  "CHS761X4": { A: 906.035, Iy: 590555 },
  "CHS761X63": { A: 1381.48, Iy: 848185 },
  "CHS761X8": { A: 1711.54, Iy: 1005870 },
  "CHS889X32": { A: 861.55, Iy: 792059 },
  "CHS889X4": { A: 1066.88, Iy: 963398 },
  "CHS889X63": { A: 1634.82, Iy: 1402360 },
  "CHS889X8": { A: 2033.24, Iy: 1679660 },
  "CHS1143X36": { A: 1251.99, Iy: 1919840 },
  "CHS1143X4": { A: 1386.07, Iy: 2110650 },
  "CHS1143X5": { A: 1716.88, Iy: 2569200 },
  "CHS1143X8": { A: 2671.61, Iy: 3794920 },
  "CHS1143X10": { A: 3276.68, Iy: 4496630 },
  "CHS1397X4": { A: 1705.26, Iy: 3928590 },
  "CHS1397X5": { A: 2115.86, Iy: 4805410 },
  "CHS1397X63": { A: 2640.26, Iy: 5886210 },
  "CHS1397X10": { A: 4074.65, Iy: 8618940 },
  "CHS1397X125": { A: 4995.13, Iy: 10200100 },
  "CHS1683X4": { A: 2064.65, Iy: 6970920 },
  "CHS1683X5": { A: 2565.11, Iy: 8558460 },
  "CHS1683X63": { A: 3206.31, Iy: 10534200 },
  "CHS1683X10": { A: 4973.14, Iy: 15639800 },
  "CHS1683X125": { A: 6118.25, Iy: 18683500 },
  "CHS1937X5": { A: 2964.09, Iy: 13202300 },
  "CHS1937X63": { A: 3709.03, Iy: 16300500 },
  "CHS1937X8": { A: 4667.15, Iy: 20155400 },
  "CHS1937X10": { A: 5771.11, Iy: 24415900 },
  "CHS1937X125": { A: 7115.71, Iy: 29343100 },
  "CHS1937X16": { A: 8932.18, Iy: 35542600 },
  "CHS2191X5": { A: 3363.07, Iy: 19280400 },
  "CHS2191X63": { A: 4211.74, Iy: 23861400 },
  "CHS2191X8": { A: 5305.52, Iy: 29596300 },
  "CHS2191X125": { A: 8113.16, Iy: 43445800 },
  "CHS2191X16": { A: 10208.9, Iy: 52965900 },
  "CHS2191X20": { A: 12509.8, Iy: 62612900 },
  "CHS2445X63": { A: 4714.46, Iy: 33460300 },
  "CHS2445X8": { A: 5943.89, Iy: 41604500 },
  "CHS2445X10": { A: 7367.03, Iy: 50731500 },
  "CHS2445X125": { A: 9110.62, Iy: 61474200 },
  "CHS2445X16": { A: 11485.7, Iy: 75329100 },
  "CHS2445X20": { A: 14105.8, Iy: 89572e3 },
  "CHS273X63": { A: 5278.54, Iy: 46958200 },
  "CHS273X8": { A: 6660.18, Iy: 58517100 },
  "CHS273X125": { A: 10229.8, Iy: 86974500 },
  "CHS273X16": { A: 12918.2, Iy: 107068e3 },
  "CHS273X20": { A: 15896.5, Iy: 127984e3 },
  "CHS3239X63": { A: 6285.95, Iy: 79289e3 },
  "CHS3239X8": { A: 7939.43, Iy: 99100800 },
  "CHS3239X10": { A: 9861.46, Iy: 121583e3 },
  "CHS3239X16": { A: 15476.7, Iy: 183899e3 },
  "CHS3239X20": { A: 19094.6, Iy: 22139e4 },
  "CHS3556X8": { A: 8736.14, Iy: 132014e3 },
  "CHS3556X10": { A: 10857.3, Iy: 162235e3 },
  "CHS3556X125": { A: 13473.5, Iy: 198522e3 },
  "CHS3556X16": { A: 17070.2, Iy: 24663e4 },
  "CHS3556X20": { A: 21086.4, Iy: 297917e3 },
  "CHS4064X8": { A: 10012.9, Iy: 198739e3 },
  "CHS4064X10": { A: 12453.3, Iy: 244758e3 },
  "CHS4064X125": { A: 15468.4, Iy: 300307e3 },
  "CHS4064X20": { A: 24278.2, Iy: 454321e3 },
  "CHS457X10": { A: 14042.9, Iy: 350913e3 },
  "CHS457X125": { A: 17455.5, Iy: 431448e3 },
  "CHS457X16": { A: 22167.1, Iy: 539594e3 },
  "CHS457X20": { A: 27457.5, Iy: 656815e3 },
  "CHS508X10": { A: 15645.1, Iy: 485202e3 },
  "CHS508X125": { A: 19458.2, Iy: 597554e3 },
  "CHS508X16": { A: 24730.6, Iy: 74909e4 },
  "CHS508X20": { A: 30661.9, Iy: 914278e3 },
  "DIE10": { A: 2077.87, Iy: 3274140 },
  "DIE12": { A: 2497.87, Iy: 5976100 },
  "DIE14": { A: 3107.61, Iy: 10199300 },
  "DIE16": { A: 3786.25, Iy: 15881200 },
  "DIE18": { A: 4696.25, Iy: 26052300 },
  "DIE20": { A: 5703.14, Iy: 38783900 },
  "DIE22": { A: 6556.54, Iy: 55346600 },
  "DIE24": { A: 7764.28, Iy: 77419900 },
  "DIE26": { A: 8722.08, Iy: 104324e3 },
  "DIE28": { A: 9749.12, Iy: 133574e3 },
  "DIE30": { A: 11179.1, Iy: 179705e3 },
  "DIE32": { A: 12469.4, Iy: 225562e3 },
  "DIE34": { A: 13401.4, Iy: 276257e3 },
  "DIE36": { A: 14346.6, Iy: 326626e3 },
  "DIE38": { A: 15316.6, Iy: 391352e3 },
  "DIE40": { A: 16086.6, Iy: 452095e3 },
  "DIE425": { A: 17142.1, Iy: 546814e3 },
  "DIE45": { A: 18250.1, Iy: 643788e3 },
  "DIE475": { A: 19353.6, Iy: 763466e3 },
  "DIE50": { A: 20470.4, Iy: 883071e3 },
  "DIE55": { A: 21417.4, Iy: 111967e4 },
  "DIE60": { A: 23528.3, Iy: 14399e5 },
  "DIE65": { A: 24228.3, Iy: 172963e4 },
  "DIE70": { A: 26737.8, Iy: 2188e6 },
  "DIE75": { A: 27487.8, Iy: 256388e4 },
  "DIE80": { A: 30217.8, Iy: 320089e4 },
  "DIE85": { A: 33070.6, Iy: 390997e4 },
  "DIE90": { A: 33920.6, Iy: 446042e4 },
  "DIE95": { A: 34770.6, Iy: 505326e4 },
  "DIE100": { A: 35620.6, Iy: 568957e4 },
  "DIL10": { A: 2693.87, Iy: 4715610 },
  "DIL12": { A: 3233.87, Iy: 8485690 },
  "DIL14": { A: 4005.61, Iy: 14767100 },
  "DIL16": { A: 4998.25, Iy: 24222100 },
  "DIL18": { A: 6044.25, Iy: 37307100 },
  "DIL20": { A: 7213.14, Iy: 55195600 },
  "DIL22": { A: 8455.14, Iy: 78582200 },
  "DIL24": { A: 9850.08, Iy: 109187e3 },
  "DIL26": { A: 11288.1, Iy: 147224e3 },
  "DIL28": { A: 12854.1, Iy: 194779e3 },
  "DIL30": { A: 14488.1, Iy: 252467e3 },
  "DIL32": { A: 15445.4, Iy: 304409e3 },
  "DIL34": { A: 16355.4, Iy: 361852e3 },
  "DIL36": { A: 17318.6, Iy: 427008e3 },
  "DIL38": { A: 18264.6, Iy: 498817e3 },
  "DIL40": { A: 19228.6, Iy: 578413e3 },
  "DIL425": { A: 20268.1, Iy: 684014e3 },
  "DIL45": { A: 21406.1, Iy: 804645e3 },
  "DIL475": { A: 22491.6, Iy: 935894e3 },
  "DIL50": { A: 23640.4, Iy: 108278e4 },
  "DIL55": { A: 25109.4, Iy: 137891e4 },
  "DIL60": { A: 26712.3, Iy: 172886e4 },
  "DIN10": { A: 2810.87, Iy: 4774930 },
  "DIN12": { A: 3380.87, Iy: 8603340 },
  "DIN14": { A: 4411.61, Iy: 15222400 },
  "DIN16": { A: 5836.25, Iy: 26338300 },
  "DIN18": { A: 6576.25, Iy: 38331400 },
  "DIN20": { A: 8273.14, Iy: 59515300 },
  "DIN22": { A: 9113.14, Iy: 80520200 },
  "DIN24": { A: 11132.1, Iy: 116864e3 },
  "DIN26": { A: 12072.1, Iy: 150502e3 },
  "DIN28": { A: 14358.1, Iy: 207222e3 },
  "DIN30": { A: 15398.1, Iy: 257593e3 },
  "DIN32": { A: 17131.4, Iy: 32249e4 },
  "DIN34": { A: 17391.4, Iy: 369416e3 },
  "DIN36": { A: 19146.6, Iy: 451223e3 },
  "DIN38": { A: 19426.6, Iy: 50949e4 },
  "DIN40": { A: 20850.6, Iy: 606421e3 },
  "DIN425": { A: 21200.6, Iy: 694826e3 },
  "DIN45": { A: 23164.1, Iy: 842228e3 },
  "DIN475": { A: 23539.1, Iy: 951219e3 },
  "DIN50": { A: 25534.4, Iy: 113177e4 },
  "DIN55": { A: 26334.4, Iy: 140342e4 },
  "DIN60": { A: 28892.3, Iy: 180829e4 },
  "DIN65": { A: 29742.3, Iy: 216782e4 },
  "DIN70": { A: 32401.8, Iy: 27029e5 },
  "DIN75": { A: 33301.8, Iy: 316256e4 },
  "DIN80": { A: 34201.8, Iy: 366386e4 },
  "DIN85": { A: 37154.6, Iy: 44389e5 },
  "DIN90": { A: 38104.6, Iy: 50604e5 },
  "DIN95": { A: 39054.6, Iy: 572953e4 },
  "DIN100": { A: 40004.6, Iy: 644748e4 },
  "INP80": { A: 757.171, Iy: 776547 },
  "INP100": { A: 1062.45, Iy: 1702710 },
  "INP120": { A: 1418.02, Iy: 3271100 },
  "INP140": { A: 1823.9, Iy: 5723500 },
  "INP160": { A: 2280.08, Iy: 9340010 },
  "INP180": { A: 2786.56, Iy: 14439e3 },
  "INP200": { A: 3343.35, Iy: 21377400 },
  "INP220": { A: 3950.44, Iy: 3055e4 },
  "INP240": { A: 4607.83, Iy: 42390400 },
  "INP260": { A: 5332.16, Iy: 57341600 },
  "INP280": { A: 6101.76, Iy: 75756700 },
  "INP300": { A: 6899.7, Iy: 97854100 },
  "INP320": { A: 7770.61, Iy: 124938e3 },
  "INP340": { A: 8667.74, Iy: 15669e4 },
  "INP360": { A: 9698.28, Iy: 195749e3 },
  "INP380": { A: 10697.5, Iy: 239772e3 },
  "INP400": { A: 11773.9, Iy: 291716e3 },
  "INP450": { A: 14693.7, Iy: 457896e3 },
  "INP500": { A: 17935.2, Iy: 686468e3 },
  "INP550": { A: 21211.5, Iy: 989944e3 },
  "INP600": { A: 25383.7, Iy: 138788e4 },
  "L20X20X3": { A: 111.912, Iy: 3876.8 },
  "L25X25X3": { A: 141.912, Iy: 7961.4 },
  "L40X40X4": { A: 307.863, Iy: 44729.8 },
  "L45X45X5": { A: 430.258, Iy: 78409.9 },
  "L50X50X5": { A: 480.258, Iy: 109643 },
  "L60X60X6": { A: 690.867, Iy: 227925 },
  "L70X70X7": { A: 939.691, Iy: 422977 },
  "L80X80X8": { A: 1226.73, Iy: 722469 },
  "L90X90X9": { A: 1551.98, Iy: 1158330 },
  "L100X100X10": { A: 1915.45, Iy: 1766760 },
  "L110X110X10": { A: 2115.45, Iy: 2386990 },
  "L120X120X12": { A: 2754.13, Iy: 3676670 },
  "L150X150X15": { A: 4302.47, Iy: 8980520 },
  "L180X180X18": { A: 6190.77, Iy: 18656e3 },
  "L200X200X20": { A: 7634.77, Iy: 28505900 },
  "L30X20X3": { A: 141.912, Iy: 12449 },
  "L30X20X4": { A: 184.912, Iy: 15868.5 },
  "L40X20X3": { A: 171.912, Iy: 27918.4 },
  "L40X20X4": { A: 224.912, Iy: 35858.2 },
  "L45X30X4": { A: 286.629, Iy: 57776.5 },
  "L45X30X5": { A: 352.629, Iy: 69914 },
  "L50X30X4": { A: 306.629, Iy: 77565.9 },
  "L50X30X5": { A: 377.629, Iy: 94070.8 },
  "L50X40X5": { A: 426.717, Iy: 103800 },
  "L60X30X5": { A: 428.863, Iy: 155510 },
  "L60X40X5": { A: 478.863, Iy: 171851 },
  "L60X40X6": { A: 567.863, Iy: 201411 },
  "L65X50X5": { A: 553.863, Iy: 231761 },
  "L70X50X6": { A: 687.863, Iy: 335274 },
  "L75X50X7": { A: 829.809, Iy: 463667 },
  "L75X55X5": { A: 630.258, Iy: 355237 },
  "L75X55X7": { A: 866.258, Iy: 479409 },
  "L80X40X6": { A: 689.258, Iy: 449180 },
  "L80X40X8": { A: 901.258, Iy: 576106 },
  "L80X60X7": { A: 937.867, Iy: 590029 },
  "L80X65X8": { A: 1102.87, Iy: 680829 },
  "L90X60X6": { A: 869.258, Iy: 716551 },
  "L90X60X8": { A: 1141.26, Iy: 925165 },
  "L100X50X6": { A: 872.691, Iy: 897119 },
  "L100X50X8": { A: 1144.69, Iy: 1160190 },
  "L100X50X10": { A: 1408.69, Iy: 1405950 },
  "L100X65X7": { A: 1116.73, Iy: 1125e3 },
  "L100X65X9": { A: 1414.73, Iy: 1406390 },
  "L100X75X9": { A: 1504.73, Iy: 1476590 },
  "L120X80X8": { A: 1548.98, Iy: 2256520 },
  "L120X80X10": { A: 1912.98, Iy: 2755300 },
  "L120X80X12": { A: 2268.98, Iy: 3228300 },
  "L130X65X8": { A: 1508.98, Iy: 2625120 },
  "L130X65X10": { A: 1862.98, Iy: 3204590 },
  "L150X75X9": { A: 1954.68, Iy: 4554110 },
  "L150X75X11": { A: 2364.68, Iy: 5452400 },
  "L150X100X10": { A: 2418.13, Iy: 5516680 },
  "L150X100X12": { A: 2874.13, Iy: 6496050 },
  "L180X90X10": { A: 2621.03, Iy: 8803400 },
  "L200X100X10": { A: 2924.14, Iy: 12185800 },
  "L200X100X12": { A: 3480.14, Iy: 14400600 },
  "L200X100X14": { A: 4028.14, Iy: 16541300 }
};

// src/lib/steelCheckBuilder.ts
function mapDeflectionClass(cls) {
  switch (cls) {
    case "roof":
      return "Roof";
    case "cantilever":
      return "Cantilever";
    case "custom":
      return "Custom";
    // Vloer die scheurgevoelige scheidingswanden draagt — NEN-EN
    // 1990:2002/NB:2019 A1.4.3(3), eerste gedachtestreepje (w2 + w3 ≤ ℓ_rep/500).
    case "floorBrittle":
      return "FloorBrittlePartitions";
    case "floor":
    default:
      return "Floor";
  }
}
function sanitizeRestraintFractions(fractions) {
  if (!Array.isArray(fractions)) return [];
  return [...new Set(fractions.filter((f) => Number.isFinite(f) && f > 0 && f < 1))].sort((a, b) => a - b);
}
var STEEL_GRADES = ["S235", "S275", "S355", "S420", "S460"];
function isSteelProfile(profileName) {
  if (!profileName) return false;
  if (isEigenProfiel(profileName)) return true;
  return profileLookupKey(profileName) in STEEL_SECTIONS;
}
function profileLookupKey(name) {
  return name.replace(/[\s\-.]/g, "").toUpperCase();
}
function beamDirection(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  if (l <= 0) return null;
  return { x: dx / l, z: dz / l };
}
function collinearContinuations(beam, nodes, beams, supports) {
  const dir = beamDirection(beam, nodes);
  if (!dir) return [];
  const opgelegd = new Set((supports ?? []).map((s) => s.nodeId));
  const uit = [];
  for (const other of beams) {
    if (other.id === beam.id) continue;
    const gedeeld = [beam.from, beam.to].filter(
      (n) => n === other.from || n === other.to
    );
    if (gedeeld.length !== 1) continue;
    if (opgelegd.has(gedeeld[0])) continue;
    if ((other.profile ?? "") !== (beam.profile ?? "")) continue;
    if ((other.material ?? "") !== (beam.material ?? "")) continue;
    const d2 = beamDirection(other, nodes);
    if (!d2) continue;
    if (Math.abs(dir.x * d2.z - dir.z * d2.x) > 1e-6) continue;
    uit.push(other.id);
  }
  return uit.sort((a, b) => a - b);
}
function deflectionNotesFor(beam, nodes, beams, supports) {
  const notes = [
    "w is gemeten vanaf de koorde tussen de verplaatste staafeinden: de starre zakking en rotatie van de staaf zelf tellen niet mee, alleen de kromming ertussen."
  ];
  const vervolg = collinearContinuations(beam, nodes, beams, supports);
  if (vervolg.length > 0) {
    notes.push(
      `Deze staaf loopt in het verlengde door in staaf ${vervolg.join(", ")} (zelfde doorsnede en materiaal) zonder oplegging op de tussenknoop. De doorbuiging is per staafdeel getoetst, dus over de koorde van dit deel en tegen L/n van dit deel \u2014 niet over de volledige overspanning. Voor een doorgaande ligger onderschat dat de veldzakking; beoordeel de overspanning als geheel.` + (supports === void 0 ? " (De opleggingen zijn niet meegegeven aan de toetsbouwer, dus een tussensteunpunt kan hier niet zijn uitgesloten.)" : "")
    );
  }
  return notes;
}
function beamLengthMm(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.z - a.z);
}
function forcePointsForCombination(beamId, comboId, result) {
  const ef = result.elements.get(beamId);
  if (!ef || ef.stations_mm.length === 0) return [];
  const pts = [];
  for (let i = 0; i < ef.stations_mm.length; i++) {
    pts.push({
      combination_id: comboId,
      position_mm: ef.stations_mm[i],
      forces: {
        n_ed: (ef.normalForce[i] ?? 0) / 1e3,
        // N → kN
        vy_ed: 0,
        vz_ed: (ef.shearForce[i] ?? 0) / 1e3,
        // N → kN
        mt_ed: 0,
        my_ed: (ef.bendingMoment[i] ?? 0) / 1e6,
        // N·mm → kN·m
        mz_ed: 0
      }
    });
  }
  return pts;
}
function buildForcesEnvelope(beamId, ulsCombinations, combinationResults) {
  const env = [];
  for (const combo of ulsCombinations) {
    const res = combinationResults.get(combo.id);
    if (!res) continue;
    env.push(...forcePointsForCombination(beamId, combo.id, res));
  }
  if (env.length === 0) {
    env.push({
      combination_id: ulsCombinations[0]?.id ?? 1,
      position_mm: 0,
      forces: { n_ed: 0, vy_ed: 0, vz_ed: 0, mt_ed: 0, my_ed: 0, mz_ed: 0 }
    });
  }
  return env;
}
function nodalDeflectionMm(beam, result) {
  let w = 0;
  for (const nid of [beam.from, beam.to]) {
    const d = result.displacements.get(nid);
    if (d && Math.abs(d.uz) > Math.abs(w)) w = d.uz;
  }
  return w;
}
function extractFieldDeflectionMm(beam, result) {
  if (!result) return 0;
  const ef = result.elements.get(beam.id);
  const stations = ef?.deflection;
  if (!ef || !Array.isArray(stations) || stations.length === 0) {
    console.warn(
      `[doorbuigingstoets] staaf ${beam.id}: geen station-zakkingen in het solverresultaat (ouder resultaat?) \u2014 val terug op knoopverplaatsingen. Dat is de ABSOLUTE verplaatsing van een staafeind, niet de doorbuiging vanaf de koorde: de veldzakking kan zowel onderschat als overschat worden. Reken het model opnieuw door.`
    );
    return nodalDeflectionMm(beam, result);
  }
  return chordRelativeMaxMm(stations, ef.stations_mm);
}
function chordRelativeMaxMm(w, stationsMm) {
  const n = w.length;
  if (n === 0) return 0;
  const wStart = w[0];
  const wEnd = w[n - 1];
  const koordeBruikbaar = Number.isFinite(wStart) && Number.isFinite(wEnd);
  const xOk = Array.isArray(stationsMm) && stationsMm.length === n && Number.isFinite(stationsMm[0]) && Number.isFinite(stationsMm[n - 1]) && stationsMm[n - 1] !== stationsMm[0];
  const x0 = xOk ? stationsMm[0] : 0;
  const span = xOk ? stationsMm[n - 1] - x0 : n - 1;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const v = w[i];
    if (!Number.isFinite(v)) continue;
    let d = v;
    if (koordeBruikbaar && span !== 0) {
      const t = xOk ? (stationsMm[i] - x0) / span : i / span;
      d = v - (wStart + t * (wEnd - wStart));
    }
    if (Math.abs(d) > Math.abs(max)) max = d;
  }
  return max;
}
function equivalentUdlFromMoments(env, lengthMm) {
  if (env.length < 3 || lengthMm <= 0) return 0;
  const sorted = [...env].sort((a, b) => a.position_mm - b.position_mm);
  const mStart = sorted[0].forces.my_ed;
  const mEnd = sorted[sorted.length - 1].forces.my_ed;
  const mid = lengthMm / 2;
  let best = sorted[0];
  for (const p of sorted) {
    if (Math.abs(p.position_mm - mid) < Math.abs(best.position_mm - mid)) best = p;
  }
  const pijlKnm = best.forces.my_ed - (mStart + mEnd) / 2;
  const qKnPerM = 8 * pijlKnm / Math.pow(lengthMm / 1e3, 2);
  return Math.abs(qKnPerM);
}
function hellingGradenVanStaaf(beam, nodes) {
  const d = beamDirection(beam, nodes);
  if (!d) return null;
  return Math.atan2(Math.abs(d.z), Math.abs(d.x)) * 180 / Math.PI;
}
var VERTICAAL_VANAF_GRADEN = 75;
function isOverwegendVerticaal(beam, nodes) {
  const helling = hellingGradenVanStaaf(beam, nodes);
  return helling !== null && helling >= VERTICAAL_VANAF_GRADEN;
}
function zijdelingseVerplaatsingMm(beam, nodes, result) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b || !result) return null;
  const boven = a.z >= b.z ? a : b;
  const onder = a.z >= b.z ? b : a;
  const dBoven = result.displacements.get(boven.id);
  const dOnder = result.displacements.get(onder.id);
  if (!dBoven || !dOnder) return null;
  return dBoven.ux - dOnder.ux;
}
var BGT_NORMCOMBINATIES = [
  { soort: "6.14b", uitdrukking: "6.14b" },
  { soort: "6.15b", uitdrukking: "6.15b" },
  { soort: "6.16b", uitdrukking: "6.16b" }
];
function nooitLeidend(karakteristiek) {
  const begeleidend = /* @__PURE__ */ new Set();
  const leidend = /* @__PURE__ */ new Set();
  for (const c of karakteristiek) {
    for (const [id, f] of c.factors) {
      if (Math.abs(f) >= 1 - 1e-9) leidend.add(id);
      else if (f !== 0) begeleidend.add(id);
    }
  }
  return [...begeleidend].filter((id) => !leidend.has(id)).sort((a, b) => a - b);
}
function nl4(x, cijfers = 1) {
  return x.toFixed(cijfers).replace(".", ",");
}
function wAddCombinatieVanKlasse(klasse) {
  switch (klasse) {
    case "FloorBrittlePartitions":
      return "de FREQUENTE belastingscombinatie (uitdrukking 6.15b), A1.4.3(3) eerste gedachtestreepje";
    case "Roof":
      return "de KARAKTERISTIEKE belastingscombinatie (uitdrukking 6.14b), A1.4.3(3) derde gedachtestreepje";
    case "Custom":
      return 'de combinatie die hoort bij de categorie waarvoor de opgegeven noemer is gekozen \u2014 de klasse "aangepast" wijst zelf geen NB-categorie aan';
    default:
      return "de FREQUENTE belastingscombinatie (uitdrukking 6.15b), A1.4.3(3) tweede gedachtestreepje";
  }
}
function bepaalDoorbuigingsInvoer(beam, data) {
  const cfg = beam.checkConfig ?? {};
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  if (cfg.deflectionClass === void 0 && isOverwegendVerticaal(beam, data.nodes)) {
    return zijdelingseEis(beam, data, slsCombos);
  }
  return vloerDakEis(beam, data, slsCombos);
}
function zijdelingseEis(beam, data, slsCombos) {
  const a = data.nodes.find((n) => n.id === beam.from);
  const b = data.nodes.find((n) => n.id === beam.to);
  const lengteMm = beamLengthMm(beam, data.nodes);
  const hoogteMm = a && b ? Math.abs(b.z - a.z) : 0;
  const helling = hellingGradenVanStaaf(beam, data.nodes) ?? 90;
  const noemer = hoogteMm > 0 ? Math.ceil(300 * lengteMm / hoogteMm) : 300;
  const grensMm = noemer > 0 ? lengteMm / noemer : 0;
  const karakteristiek = combinatiesVanSoort(slsCombos, "6.14b");
  const nietHerkend = slsCombos.filter((c) => soortVanCombinatie(c) === null);
  const kandidaten = karakteristiek.length > 0 ? [...karakteristiek, ...nietHerkend] : slsCombos;
  const gemeten = [];
  for (const combo of kandidaten) {
    const r = data.combinationResults.get(combo.id) ?? null;
    const uc = zijdelingseVerplaatsingMm(beam, data.nodes, r);
    if (uc !== null) gemeten.push({ combo, u: uc });
  }
  let maatgevend = gemeten.length > 0 ? gemeten[0] : null;
  for (const g of gemeten) {
    if (maatgevend && Math.abs(g.u) > Math.abs(maatgevend.u)) maatgevend = g;
  }
  const u = maatgevend ? maatgevend.u : null;
  const notes = [
    `Deze staaf staat overwegend verticaal (${nl4(helling)}\xB0 met de horizontaal; vanaf ${VERTICAAL_VANAF_GRADEN}\xB0 geldt hij als kolom of gevelstijl). De doorbuigingseisen van NEN-EN 1990:2002/NB:2019 A1.4.3(3) en A1.4.3(4) gelden voor VLOEREN EN DAKEN \u2014 alle vier de gedachtestreepjes van A1.4.3(3) noemen een vloer, een dak of een vloerafscheiding, en A1.4.3(4) begrenst w_max "bij zowel vloeren als daken". Een kolom is geen van beide, dus die grenswaarden zijn hier NIET toegepast.`,
    `Wat de norm voor een verticale staaf w\xE9l voorschrijft is A1.4.3(7): de horizontale verplaatsing over de hoogte (figuur A1.2), bij de KARAKTERISTIEKE belastingscombinatie (uitdrukking 6.14b), begrensd op h/300 voor andere gebouwen dan industriegebouwen; bij meer dan \xE9\xE9n bouwlaag geldt diezelfde h/300 per bouwlaag. Getoetst is daarom niet de kromming van de staaf maar u = u_x(boven) \u2212 u_x(onder), tegen h/300 = ${nl4(grensMm)} mm met h = ${nl4(hoogteMm, 0)} mm.`,
    'AANNAMES bij die grens. (1) Het gebouw is niet als industriegebouw aangemerkt; daarvoor geeft de NB h/150, en h/300 is de strengere van de twee. (2) h is gelijkgesteld aan de hoogte van deze staaf, terwijl de NB "de kleinste gevelhoogte of de kleinste bouwlaaghoogte" bedoelt; overspant deze staaf meer dan \xE9\xE9n bouwlaag, dan is de grens hier te ruim. (3) De eis h/500 voor de TOTALE hoogte van een gebouw met meer dan \xE9\xE9n bouwlaag is een eigenschap van het gebouw en niet van deze staaf, en is hier dus niet getoetst.',
    "Voor de doorbuiging van de staaf tussen zijn eigen einden \u2014 de kromming vanaf de koorde \u2014 geeft A1.4.3 bij een verticale staaf geen grenswaarde; er is er dan ook geen verzonnen. Wie hier t\xF3ch een vloer- of dakeis wil toetsen, kiest bij de staaf expliciet een doorbuigingsklasse: die keuze gaat v\xF3\xF3r en laat deze zijdelingse toets vervallen.",
    "Beide doorbuigingsregels in dit rapport (w_fin en w_add) tonen dezelfde verplaatsing tegen dezelfde grens: de norm splitst de horizontale verplaatsing niet in een blijvend en een bijkomend deel, en de rekenkern levert de twee regels altijd als paar."
  ];
  if (u === null || !maatgevend) {
    notes.push(
      "GEEN UITKOMST: " + (kandidaten.length > 0 ? `geen van de BGT-combinaties (${kandidaten.map((c) => `"${c.name}"`).join(", ")}) levert knoopverplaatsingen voor deze staaf \u2014 reken het model opnieuw door` : "het model kent geen BGT-combinatie") + ". De zijdelingse verplaatsing is daarom op 0 gezet; die 0 is een ontbrekende uitkomst en geen getoetste verplaatsing."
    );
  } else if (karakteristiek.length === 0) {
    notes.push(
      `u = ${nl4(u, 2)} mm, de grootste over alle BGT-combinaties; maatgevend is "${maatgevend.combo.name}". LET OP: het model kent GEEN karakteristieke combinatie (uitdrukking 6.14b). Dit is dus geen toetsing volgens A1.4.3(7), maar een vervanger \u2014 voeg de karakteristieke combinaties toe (of kies de standaardcombinaties) om de eis letterlijk uit te voeren.`
    );
  } else {
    const nietHerkendGemeten = gemeten.filter((g) => nietHerkend.includes(g.combo));
    notes.push(
      `u = ${nl4(u, 2)} mm: de grootste horizontale verplaatsing over de ${gemeten.length - nietHerkendGemeten.length} karakteristieke BGT-combinaties (6.14b)` + (nietHerkendGemeten.length > 0 ? ` en ${nietHerkendGemeten.length} niet herkende BGT-combinatie(s)` : "") + " \u2014 " + gemeten.map((g) => `"${g.combo.name}" ${nl4(g.u, 2)} mm`).join("; ") + `. Maatgevend is "${maatgevend.combo.name}".`
    );
    if (nietHerkendGemeten.length > 0) {
      notes.push(
        "Ook meegewogen, veilig-zijdig: " + nietHerkendGemeten.map((g) => `"${g.combo.name}"`).join(", ") + '. Deze BGT-combinatie(s) zijn niet als 6.14b, 6.15b of 6.16b herkend (geen kenmerk, en de naam bevat geen "karakter", "frequent" of "quasi"); welke uitdrukking ze zijn is niet af te lezen, en weglaten zou een grotere verplaatsing stil laten vallen.'
      );
    }
    const zonderLeiding = nooitLeidend(karakteristiek);
    if (zonderLeiding.length > 0) {
      notes.push(
        `LET OP: belastinggeval ${zonderLeiding.join(", ")} staat in de karakteristieke combinaties alleen als begeleidende last (factor < 1), nooit als leidende. Uitdrukking 6.14b vraagt een combinatie met elke veranderlijke belasting als leidende; voor deze last ontbreekt die, en de getoetste verplaatsing kan daardoor te laag zijn.`
      );
    }
  }
  return {
    // "Custom" met een opgegeven noemer: alleen zo rekent de kern L/n met een
    // noemer die niet uit de vloer-/dakcategorieën van A1.4.3(3) komt.
    klasse: "Custom",
    noemerFin: noemer,
    noemerAdd: noemer,
    wMm: u ?? 0,
    // ℓ_rep = 2 × L hoort bij een uitkragende vloer of dakrand, niet bij een
    // horizontale verplaatsing; die verdubbeling mag hier niet gebeuren.
    isUitkraging: false,
    eis: "zijdelings",
    notes
  };
}
function vloerDakEis(beam, data, slsCombos) {
  const cfg = beam.checkConfig ?? {};
  const klasse = mapDeflectionClass(cfg.deflectionClass);
  const gewogen = [];
  const ontbreekt = [];
  for (const norm of BGT_NORMCOMBINATIES) {
    let gevonden = false;
    for (const combo of combinatiesVanSoort(slsCombos, norm.soort)) {
      const result = data.combinationResults.get(combo.id) ?? null;
      if (!result || !result.elements.has(beam.id)) continue;
      gevonden = true;
      gewogen.push({
        naam: combo.name,
        uitdrukking: norm.uitdrukking,
        w: extractFieldDeflectionMm(beam, result)
      });
    }
    if (!gevonden) ontbreekt.push(norm.uitdrukking);
  }
  const nietHerkend = [];
  for (const combo of slsCombos) {
    if (soortVanCombinatie(combo) !== null) continue;
    const result = data.combinationResults.get(combo.id) ?? null;
    if (!result || !result.elements.has(beam.id)) continue;
    gewogen.push({
      naam: combo.name,
      uitdrukking: "niet herkend als 6.14b/6.15b/6.16b",
      w: extractFieldDeflectionMm(beam, result)
    });
    nietHerkend.push(combo.name);
  }
  let maatgevend = gewogen.length > 0 ? gewogen[0] : null;
  for (const g of gewogen) {
    if (maatgevend && Math.abs(g.w) > Math.abs(maatgevend.w)) maatgevend = g;
  }
  const notes = deflectionNotesFor(beam, data.nodes, data.beams, data.supports);
  if (!maatgevend) {
    notes.push(
      "GEEN UITKOMST: geen enkele BGT-combinatie levert een zakking voor deze staaf \u2014 reken het model opnieuw door. De zakking is op 0 gezet; die 0 is een ontbrekende uitkomst en geen getoetste zakking."
    );
  } else {
    notes.push(
      "w is de grootste zakking over de BGT-combinaties die NEN-EN 1990 A1.4.3 aanwijst en die dit model kent: " + gewogen.map((g) => `"${g.naam}" (${g.uitdrukking}) ${nl4(g.w, 2)} mm`).join("; ") + `. Maatgevend is "${maatgevend.naam}".`,
      `De rekenkern leidt w_fin \xE9n w_add uit \xE9\xE9n zakking af, terwijl de norm er twee combinaties voor aanwijst: w_max bij de QUASI-BLIJVENDE combinatie (uitdrukking 6.16b, A1.4.3(4)) en w2 + w3 bij ${wAddCombinatieVanKlasse(klasse)}. Door de grootste van de voorgeschreven combinaties te nemen is geen van beide toetsen lichter dan de norm vraagt; is de maatgevende combinatie zwaarder dan de voorgeschreven, dan valt de toets strenger uit.`
    );
    if (nietHerkend.length > 0) {
      notes.push(
        "Ook meegewogen, veilig-zijdig: " + nietHerkend.map((n) => `"${n}"`).join(", ") + '. Deze BGT-combinatie(s) zijn niet als 6.14b, 6.15b of 6.16b herkend (geen kenmerk, en de naam bevat geen "karakter", "frequent" of "quasi"); welke uitdrukking ze zijn is niet af te lezen, en weglaten zou een grotere zakking stil laten vallen. Is een ervan een van de drie, geef haar dan een herkenbare naam.'
      );
    }
    if (ontbreekt.length > 0) {
      notes.push(
        `Niet meegewogen omdat dit model ze niet kent of niet heeft doorgerekend: uitdrukking ${ontbreekt.join(" en ")}. Zit de combinatie die A1.4.3 voor deze categorie voorschrijft daarbij, dan is de zakking hierboven een vervanger en geen letterlijke uitvoering van dat artikel.`
      );
    }
  }
  notes.push(
    "w_add is hier GELIJK aan w_fin. De norm meet w2 + w3 vanaf w1, de zakking onder alleen de blijvende belasting (figuur NB.1 bij A1.4.3(2)); die leidt deze toets niet uit de doorgerekende combinaties af. w_BGT,permanent is daarom 0: w_add krijgt de VOLLEDIGE zakking in plaats van alleen het deel bovenop de blijvende belasting. Veilig-zijdig, maar de w_add-regel is daarmee geen w2 + w3, en de twee doorbuigingsregels tonen hetzelfde getal."
  );
  return {
    klasse,
    // De kern gebruikt de noemer alleen bij klasse "Custom"
    // (deflection.rs::default_numerator); anders geldt de klassenoemer.
    noemerFin: cfg.deflectionClass === "custom" ? cfg.deflectionLimitNumerator ?? 333 : 333,
    // 0 = de kern leidt de w_add-noemer af uit de klasse volgens
    // NEN-EN 1990:2002/NB:2019 A1.4.3(3); dat is de normale gang van zaken.
    // Een getal hier overschrijft die klassewaarde en is alleen bedoeld om een
    // externe referentie-uitwerking met een vaste noemer na te rekenen.
    noemerAdd: cfg.deflectionAddLimitNumerator ?? 0,
    wMm: maatgevend ? maatgevend.w : 0,
    isUitkraging: cfg.deflectionClass === "cantilever",
    eis: "vloerdak",
    notes
  };
}
function buildSteelCheckInputs(ruweData) {
  const lijn = voegDoorgaandeLijnenSamen(ruweData);
  const data = toetsdataInReferentierichting(lijn.data);
  const alleBeams = ruweData.alleBeams ?? ruweData.beams;
  const inputs = [];
  const skipped = [...lijn.overgeslagen];
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  for (const beam of data.beams) {
    const profileName = beam.profile ?? "";
    if (!isSteelProfile(profileName)) {
      if (profileName.trim() !== "" && STEEL_GRADES.includes((beam.material ?? "").toUpperCase())) {
        skipped.push({
          beamId: beam.id,
          reason: `profiel "${profileName}" is niet bekend in de EN 1993-profieldatabase`
        });
      }
      continue;
    }
    const eigen = isEigenProfiel(profileName) ? zoekEigenDoorsnede(profileName) : void 0;
    if (isEigenProfiel(profileName) && !eigen) {
      skipped.push({
        beamId: beam.id,
        reason: `eigen doorsnede "${eigenNaamVan(profileName)}" is niet (meer) bewaard \u2014 open de profieleditor en bewaar hem opnieuw`
      });
      continue;
    }
    const profile = eigen ? void 0 : data.profileDb.get(profileLookupKey(profileName));
    if (!eigen && !profile) {
      skipped.push({
        beamId: beam.id,
        reason: `profiel "${profileName}" is niet bekend in de EN 1993-profieldatabase`
      });
      continue;
    }
    const hMm = eigen ? eigen.motor.z_max_mm - eigen.motor.z_min_mm : profile.geometry.h;
    const grade = beam.material ?? "";
    if (grade.trim() === "") {
      skipped.push({
        beamId: beam.id,
        reason: `staaf heeft een staalprofiel ("${profileName}") maar geen materiaal \u2014 kies een staalsoort (S235\u2013S460); er wordt geen S235 aangenomen`
      });
      continue;
    }
    if (!STEEL_GRADES.includes(grade.toUpperCase())) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${grade}" is geen ondersteunde staalsoort (S235\u2013S460) \u2014 staaf heeft een staalprofiel maar geen staalmateriaal`
      });
      continue;
    }
    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 \u2014 knopen ontbreken" });
      continue;
    }
    const hasAnyResult = ulsCombos.some(
      (c) => data.combinationResults.get(c.id)?.elements.has(beam.id)
    );
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties \u2014 reken het model eerst door"
      });
      continue;
    }
    const forcesEnvelope = buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults);
    let govComboId = forcesEnvelope[0].combination_id;
    let govAbsMy = 0;
    for (const p of forcesEnvelope) {
      if (Math.abs(p.forces.my_ed) > govAbsMy) {
        govAbsMy = Math.abs(p.forces.my_ed);
        govComboId = p.combination_id;
      }
    }
    const govPoints = forcesEnvelope.filter((p) => p.combination_id === govComboId);
    const cfg = zeegVoorToets(beam, data.nodes);
    const doorbuiging = bepaalDoorbuigingsInvoer(beam, data);
    const ledenVanLijn = new Set(lijn.lijnen.get(beam.id)?.delen.map((d) => d.beam.id) ?? []);
    const staafeinden = bepaalStaafeinden(beam, data.nodes, alleBeams, data.supports, ledenVanLijn, ruweData.plates);
    const staafNotities = [...lijn.notities.get(beam.id) ?? []];
    const alphaNotitie = alphaCrStaafNotitie(
      ruweData.stabiliteit,
      Math.min(...forcesEnvelope.map((p) => p.forces.n_ed)),
      Number.isFinite(cfg.bucklingLengthY_m) && cfg.bucklingLengthY_m > 0
    );
    if (alphaNotitie) staafNotities.push(alphaNotitie);
    inputs.push({
      beam_id: beam.id,
      profile_name: eigen ? eigen.naam : profileName,
      ...eigen ? { custom_section: naarCustomSection(eigen) } : {},
      steel_grade: grade.toUpperCase(),
      length_m: lengthMm / 1e3,
      forces_envelope: forcesEnvelope,
      lateral_bracing: {
        top_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraints),
        bottom_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraintsBottom)
      },
      // Bij een staande staaf noemt de kern de boven- en onderflens in
      // wereldtermen (links en rechts); weglaten betekent liggend.
      ...referentieVanStaaf(beam, data.nodes).staafstand === "Staand" ? { staafstand: "Staand" } : {},
      // Dicht bij de sprong van "boven" — een naar links hellende staaf rond
      // 75°, zie `richtingssprongNotities` — zet de kern een waarschuwing bij
      // de kiptoets. Weglaten = geen waarschuwing, en zo blijft de invoer van
      // elke andere staaf byte-gelijk aan vroeger.
      ...(() => {
        const notities = richtingssprongNotities(beam, data.nodes, "staal");
        return notities.length > 0 ? { staafstand_notities: notities } : {};
      })(),
      // Alleen meegeven als een staafeind géén gaffel is: zo blijft de invoer
      // van elke gewone staaf byte-gelijk aan vroeger, en zegt een aanwezig
      // veld de lezer meteen dat hier iets bijzonders is.
      ...staafeinden.begin !== "Gaffel" || staafeinden.eind !== "Gaffel" ? { staafeinden } : {},
      ...staafNotities.length > 0 ? { staaf_notities: staafNotities } : {},
      // Kniklengtes: een leeg veld gaat als 0 = "niet opgegeven" naar de kern.
      // De KERN kiest dan — om y de staaflengte, om z de grootste afstand
      // tussen plaatsen met een kipsteun aan beide flenzen, anders de
      // staaflengte — en zet de herkomst in de toets 6.3.1. Hier stond tot
      // september 2026 `?? lengthMm / 1000`: de toets kon een terugval dan niet
      // van een opgave onderscheiden, en het rapport zweeg erover.
      buckling_length_y_m: cfg.bucklingLengthY_m ?? 0,
      buckling_length_z_m: cfg.bucklingLengthZ_m ?? 0,
      // Welke doorbuigingseis hier geldt, met welke verplaatsing en welke
      // grens — zie `bepaalDoorbuigingsInvoer`. Een overwegend verticale staaf
      // krijgt de zijdelingse eis van A1.4.3(7) in plaats van een vloereis.
      deflection_limit_class: doorbuiging.klasse,
      deflection_limit_numerator: doorbuiging.noemerFin,
      deflection_add_limit_numerator: doorbuiging.noemerAdd,
      // Waar de verplaatsing vandaan komt, uit welke combinatie, en wat er bij
      // is aangenomen. Landt in de notes van de w_fin-regel van het rapport.
      deflection_notes: [...doorbuiging.notes, ...zeegNotities(beam, data.nodes)],
      // mm met teken: bij een ligger het veldmaximum vanaf de koorde
      // (negatief = omlaag), bij een kolom de zijdelingse verplaatsing.
      deflection_actual_max_mm: doorbuiging.wMm,
      is_cantilever: doorbuiging.isUitkraging,
      // De gevolgklasse van het PROJECT. Tot september 2026 stond hier hard
      // "CC1", los van de projectinstelling. De kern past K_FI niet toe
      // (orchestrator.rs): de klasse zit al in γ_G en γ_Q van de combinaties
      // volgens NB tabel NB.4/NB.5; dit veld is vermelding.
      consequence_class: data.gevolgklasse ?? STANDAARD_GEVOLGKLASSE,
      pre_camber_mm: cfg.preCamber_mm ?? 0,
      // Het blijvende deel w1 is uit de combinatieresultaten niet af te leiden
      // → 0, dus w_add = w_fin. Veilig-zijdig, en `bepaalDoorbuigingsInvoer`
      // zet die gelijkstelling met reden in het rapport.
      deflection_permanent_mm: 0,
      q_equiv_n_per_mm: equivalentUdlFromMoments(govPoints, lengthMm),
      // AANNAME, bewust niet meegenomen in de kipreparatie van sept 2026:
      // de last grijpt aan op de bovenflens, z_a = +h/2. `c2_gecorrigeerd`
      // maakt daar een negatieve C₂ van, wat M_cr verlaagt — veilig-zijdig, en
      // dat blijft zo ongeacht welke flens gedrukt is. Bij hogging (gedrukte
      // ONDERflens) grijpt een neerwaartse last echter aan op de GETROKKEN
      // flens en werkt hij in werkelijkheid stabiliserend; de aanname is daar
      // dus conservatief in plaats van juist. Het echte aangrijpingspunt is nu
      // niet bekend in de invoer; dit hoort een expliciet veld te worden.
      z_a_mm: hMm / 2
    });
  }
  return { inputs, skipped };
}

// src/lib/belastingduur.ts
var DUURKLASSEN = [
  "Permanent",
  "LongTerm",
  "MediumTerm",
  "ShortTerm",
  "Instantaneous"
];
var DUURKLASSE_NAAM = {
  Permanent: "blijvend",
  LongTerm: "lang",
  MediumTerm: "middellang",
  ShortTerm: "kort",
  Instantaneous: "zeer kort"
};
var rang = (d) => DUURKLASSEN.indexOf(d);
function langsteKlasse(klassen) {
  return klassen.reduce((a, b) => rang(b) < rang(a) ? b : a, "Instantaneous");
}
function duurklasseVanGeval(lc) {
  switch (lc.type) {
    case "dead":
      return { klasse: "Permanent", reden: "blijvend: eigen gewicht (NB tabel 2.2)" };
    case "snow":
      return { klasse: "ShortTerm", reden: "kort: sneeuw (NB tabel 2.2)" };
    case "wind":
      return { klasse: "ShortTerm", reden: "kort: wind (NB tabel 2.2)" };
    case "live": {
      const cat = lc.categorie ?? "A";
      switch (cat) {
        case "A":
        case "B":
        case "C":
        case "D":
          return {
            klasse: "MediumTerm",
            reden: `middellang: opgelegde vloerbelasting, categorie ${cat}${lc.categorie ? "" : " (geen categorie = A)"} (NB tabel 2.2)`
          };
        case "E":
        case "industrie-lang":
          return { klasse: "LongTerm", reden: `lang: opslag, categorie ${cat} (NB tabel 2.2)` };
        case "H":
          return {
            klasse: "ShortTerm",
            reden: "kort: onderhoudsbelasting op daken, categorie H \u2014 tabel 2.2 noemt daken niet; kortdurend is een besluit van de constructeur (september 2026)"
          };
        default:
          return {
            klasse: "MediumTerm",
            reden: `middellang: categorie ${cat} staat niet in tabel 2.2; veilig-zijdig de langere klasse aangehouden (een langere klasse geeft een lagere k_mod)`
          };
      }
    }
    default:
      return {
        klasse: null,
        reden: `type ${lc.type === "other" ? '"overig"' : "onbekend"} heeft geen belastingduurklasse en maakt de duur niet korter`
      };
  }
}
var gevalNaam = (lc) => `geval ${lc.id} "${lc.name}"`;
function leidAf(combinatie, gevallen, gevuld) {
  const dragend = [];
  const notities = [];
  for (const [id, factor] of combinatie.factors) {
    if (factor === 0) continue;
    const lc = gevallen.get(id);
    if (!lc) {
      notities.push(`geval ${id} bestaat niet en telt niet mee`);
      continue;
    }
    if (gevuld && !gevuld(id)) {
      notities.push(`${gevalNaam(lc)} heeft geen werkzame last en telt niet mee`);
      continue;
    }
    const duur = duurklasseVanGeval(lc);
    if (duur.klasse === null) {
      notities.push(`${gevalNaam(lc)}: ${duur.reden}`);
      continue;
    }
    dragend.push({ lc, duur });
  }
  if (!gevuld) {
    notities.push(
      "of een geval een werkzame last heeft is niet meegegeven; elk geval met een factor telt mee"
    );
  }
  let klasse;
  let basis;
  if (dragend.length === 0) {
    klasse = "Permanent";
    basis = "geen belastinggeval met werkzame last en een duurklasse; blijvend aangehouden (de langste klasse, veilig-zijdig)";
  } else {
    klasse = dragend.reduce((a, d) => rang(d.duur.klasse) > rang(a) ? d.duur.klasse : a, "Permanent");
    const bepalend = dragend.find((d) => d.duur.klasse === klasse);
    basis = klasse === "Permanent" ? `alleen blijvende belasting: ${gevalNaam(bepalend.lc)}, ${bepalend.duur.reden}` : `kortste: ${gevalNaam(bepalend.lc)}, ${bepalend.duur.reden}`;
  }
  if (notities.length > 0) basis += `; ${notities.join("; ")}`;
  const alleenBlijvend = dragend.length > 0 && dragend.every((d) => d.duur.klasse === "Permanent");
  return { klasse, basis, alleenBlijvend };
}
function belastingduurPerCombinatie(p) {
  const gevallen = new Map(p.loadCases.map((lc) => [lc.id, lc]));
  const uit = [];
  for (const c of p.combinaties) {
    if (c.type !== "uls") continue;
    const a = leidAf(c, gevallen, p.gevuld);
    let klasse = a.klasse;
    let basis = a.basis;
    if (p.ondergrens !== void 0) {
      const naam = DUURKLASSE_NAAM[p.ondergrens];
      if (rang(p.ondergrens) < rang(klasse)) {
        klasse = p.ondergrens;
        basis += `; verlengd tot ${naam} door de opgegeven belastingduur van de staaf (een opgegeven klasse werkt als ondergrens)`;
      } else if (rang(p.ondergrens) > rang(klasse)) {
        basis += `; de opgegeven belastingduur "${naam}" van de staaf is korter en telt niet: een opgegeven klasse mag de duur nooit korter maken dan de belasting in de combinatie (3.1.3(2))`;
      }
    }
    uit.push({ combination_id: c.id, load_duration: klasse, basis: `${c.name}: ${basis}` });
  }
  return uit;
}
function ontbrekendeBlijvendeCombinatie(p) {
  const gevallen = new Map(p.loadCases.map((lc) => [lc.id, lc]));
  const blijvend = p.loadCases.filter((lc) => lc.type === "dead" && (!p.gevuld || p.gevuld(lc.id)));
  if (blijvend.length === 0) return null;
  const uls = p.combinaties.filter((c) => c.type === "uls");
  if (uls.length === 0) return null;
  const heeft = uls.some((c) => leidAf(c, gevallen, p.gevuld).alleenBlijvend);
  return heeft ? null : blijvend;
}

// src/lib/timberCheckBuilder.ts
function mapServiceClass(sc) {
  switch (sc) {
    case 2:
      return "Sc2";
    case 3:
      return "Sc3";
    case 1:
    default:
      return "Sc1";
  }
}
function mapLoadDuration(d) {
  switch (d) {
    case "permanent":
      return "Permanent";
    case "long":
      return "LongTerm";
    case "short":
      return "ShortTerm";
    case "instantaneous":
      return "Instantaneous";
    case "medium":
    default:
      return "MediumTerm";
  }
}
function mapLtbLoadPosition(p) {
  switch (p) {
    case "compressionEdge":
      return "CompressionEdge";
    case "tensionEdge":
      return "TensionEdge";
    case "centreOfGravity":
    default:
      return "CentreOfGravity";
  }
}
var K_CR_STANDAARD = 1;
function kCrUitConfig(cfg) {
  const k = cfg.kCr;
  if (k === void 0) return { kCr: K_CR_STANDAARD };
  if (typeof k !== "number" || !Number.isFinite(k) || k <= 0 || k > 1) {
    return {
      fout: `k_cr = ${String(k)} ligt buiten (0, 1] \u2014 b_ef = k_cr \xB7 b (EN 1995-1-1 6.1.7, 6.13a) kan niet nul, negatief of groter dan de breedte zijn; leeg = 1,0 (NB bij 6.1.7)`
    };
  }
  return { kCr: k };
}
function timberDeflectionNumerators(cls, customN) {
  switch (cls) {
    case "roof":
      return { fin: 250, add: 250 };
    case "floorBrittle":
      return { fin: 250, add: 500 };
    case "cantilever":
      return { fin: 125, add: 167 };
    case "custom": {
      const n = customN && customN > 0 ? customN : 333;
      return { fin: n, add: n };
    }
    case "floor":
    default:
      return { fin: 250, add: 333 };
  }
}
var SUPPORTED_TIMBER_GRADES = [
  "C14",
  "C16",
  "C18",
  "C20",
  "C22",
  "C24",
  "C27",
  "C30",
  "C35",
  "GL24h",
  "GL28h",
  "GL32h",
  "GL36h"
];
var UNSUPPORTED_TIMBER_GRADES = ["D30", "D35", "D40", "D50", "D60", "D70"];
var GENERIC_TIMBER_NAMES = ["timber (softwood)", "timber (hardwood)", "wood", "hout"];
function matchSupportedTimberGrade(materialName, supportedGrades = SUPPORTED_TIMBER_GRADES) {
  if (!materialName) return null;
  const trimmed = materialName.trim();
  const hit = supportedGrades.find((g) => g.toLowerCase() === trimmed.toLowerCase());
  return hit ?? null;
}
function parseTimberRectMm(profileName) {
  const name = profileName?.trim();
  if (!name) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s+(?:SLS|EU|CLS|GL))?$/i.exec(name);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (bMm > 0 && hMm > 0) return { bMm, hMm };
  return null;
}
function quasiPermanentDeflection(beam, combo, result, wInstMm) {
  const terugval = (reden) => ({
    mm: wInstMm,
    notes: [
      `w_qp is gelijkgesteld aan de volledige zakking onder de karakteristieke BGT-combinatie omdat ${reden}. De kruip (k_def) wordt daarmee over de volle veranderlijke belasting gerekend in plaats van over het quasi-blijvende deel (\u03A3 \u03C8\u2082,i \xB7 Q_k,i, NEN-EN 1990 uitdrukking 6.16b): veilig-zijdig, maar w_fin \u2014 en daarmee ook het daaruit afgeleide w_add \u2014 valt hoger uit dan de norm vraagt.`
    ]
  });
  if (!combo) {
    return terugval(
      'het model geen quasi-blijvende BGT-combinatie kent (verwacht: een BGT-combinatie met "quasi" in de naam)'
    );
  }
  if (!result || !result.elements.has(beam.id)) {
    return terugval(
      `combinatie "${combo.name}" geen krachtsverloop voor deze staaf oplevert \u2014 reken het model opnieuw door`
    );
  }
  return {
    mm: extractFieldDeflectionMm(beam, result),
    notes: [
      `w_qp is de zakking onder de quasi-blijvende BGT-combinatie "${combo.name}" (${combo.formula}); de \u03C8\u2082-factoren zitten in de combinatiefactoren. Kruip volgens EN 1995-1-1 \xA77.2: w_fin = w_inst + k_def \xB7 w_qp.`
    ]
  };
}
function grootsteZakking(beam, combos, results) {
  const alle = [];
  for (const combo of combos) {
    const r = results.get(combo.id);
    if (!r || !r.elements.has(beam.id)) continue;
    alle.push({ combo, w: extractFieldDeflectionMm(beam, r) });
  }
  if (alle.length === 0) return null;
  let max = alle[0];
  for (const a of alle) if (Math.abs(a.w) > Math.abs(max.w)) max = a;
  return { ...max, alle };
}
function buildTimberCheckInputs(ruweData) {
  const lijn = voegDoorgaandeLijnenSamen(ruweData);
  const data = toetsdataInReferentierichting(lijn.data);
  const inputs = [];
  const skipped = [...lijn.overgeslagen];
  const grades = data.supportedGrades && data.supportedGrades.length > 0 ? data.supportedGrades : SUPPORTED_TIMBER_GRADES;
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  const slsKarakteristiek = combinatiesVanSoort(slsCombos, "6.14b");
  const slsQuasiLijst = combinatiesVanSoort(slsCombos, "6.16b");
  const slsNietHerkend = slsCombos.filter((c) => soortVanCombinatie(c) === null);
  const metLast = data.gevallenMetLast ? new Set(data.gevallenMetLast) : null;
  const gevuld = metLast ? (id) => metLast.has(id) : void 0;
  for (const beam of data.beams) {
    const materialName = beam.material?.trim() ?? "";
    const grade = matchSupportedTimberGrade(materialName, grades);
    if (!grade) {
      const lower = materialName.toLowerCase();
      if (UNSUPPORTED_TIMBER_GRADES.some((g) => g.toLowerCase() === lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" (loofhout) wordt nog niet ondersteund door de EN 1995-kern`
        });
      } else if (GENERIC_TIMBER_NAMES.includes(lower)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" heeft geen sterkteklasse \u2014 kies bijv. C24 of GL28h`
        });
      }
      continue;
    }
    let custom;
    let bMm;
    let hMm;
    if (isEigenProfiel(beam.profile)) {
      const eigen = zoekEigenDoorsnede(beam.profile);
      if (!eigen) {
        skipped.push({
          beamId: beam.id,
          reason: `eigen doorsnede "${eigenNaamVan(beam.profile)}" is niet (meer) bewaard \u2014 open de profieleditor en bewaar hem opnieuw`
        });
        continue;
      }
      const cs = naarCustomSection(eigen);
      if (cs.lamellen.length === 0) {
        skipped.push({
          beamId: beam.id,
          reason: `eigen doorsnede "${eigen.naam}" is niet uit platen opgebouwd \u2014 de houttoetsing heeft de vorm zelf nodig voor de dwarskracht (art. 6.1.7 vraagt de breedte op de beschouwde vezel); teken hem als samenstelling van lamellen`
        });
        continue;
      }
      custom = cs;
      bMm = eigen.motor.y_max_mm - eigen.motor.y_min_mm;
      hMm = eigen.motor.z_max_mm - eigen.motor.z_min_mm;
    } else {
      if (isSteelProfile(beam.profile)) {
        skipped.push({
          beamId: beam.id,
          reason: `materiaal "${materialName}" is hout maar profiel "${beam.profile}" is een staalprofiel \u2014 kies een houtdoorsnede (bijv. "60x100") of een staalsoort`
        });
        continue;
      }
      const rect = parseTimberRectMm(beam.profile);
      if (!rect) {
        skipped.push({
          beamId: beam.id,
          reason: `doorsnede "${beam.profile ?? "\u2014"}" is geen herkenbare rechthoek b\xD7h \u2014 gebruik bijv. "60x100" of "96x450 GL" als profielnaam, of teken hem in de profieleditor`
        });
        continue;
      }
      bMm = rect.bMm;
      hMm = rect.hMm;
    }
    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 \u2014 knopen ontbreken" });
      continue;
    }
    const hasAnyResult = ulsCombos.some(
      (c) => data.combinationResults.get(c.id)?.elements.has(beam.id)
    );
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties \u2014 reken het model eerst door"
      });
      continue;
    }
    const forcesEnvelope = buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults);
    const inst = grootsteZakking(
      beam,
      slsKarakteristiek.length > 0 ? [...slsKarakteristiek, ...slsNietHerkend] : slsCombos,
      data.combinationResults
    );
    const wInstMm = inst ? inst.w : 0;
    const nietHerkendGemeten = inst ? inst.alle.filter((a) => slsNietHerkend.includes(a.combo)) : [];
    const instNotes = inst ? [
      (slsKarakteristiek.length > 0 ? "w_inst is de grootste zakking over de karakteristieke BGT-combinaties (6.14b): " : "LET OP: het model kent GEEN karakteristieke BGT-combinatie (6.14b); w_inst is daarom de grootste zakking over alle BGT-combinaties: ") + inst.alle.map((a) => `"${a.combo.name}" ${a.w.toFixed(2).replace(".", ",")} mm`).join("; ") + `. Maatgevend is "${inst.combo.name}".`,
      ...slsKarakteristiek.length > 0 && nietHerkendGemeten.length > 0 ? [
        'Ook meegewogen, veilig-zijdig: BGT-combinatie(s) die niet als 6.14b, 6.15b of 6.16b herkend worden (geen kenmerk, en de naam bevat geen "karakter", "frequent" of "quasi"): ' + nietHerkendGemeten.map((a) => `"${a.combo.name}"`).join(", ") + ". Welke uitdrukking ze zijn is niet af te lezen; ze weglaten zou een grotere zakking stil laten vallen."
      ] : []
    ] : [
      "GEEN UITKOMST voor w_inst: geen enkele BGT-combinatie levert een zakking voor deze staaf \u2014 reken het model opnieuw door. De 0 is een ontbrekende uitkomst."
    ];
    const quasi = grootsteZakking(beam, slsQuasiLijst, data.combinationResults);
    const wQuasi = quasiPermanentDeflection(
      beam,
      quasi?.combo ?? slsQuasiLijst[0] ?? null,
      quasi ? data.combinationResults.get(quasi.combo.id) ?? null : null,
      wInstMm
    );
    const cfg = beam.checkConfig ?? {};
    const defl = timberDeflectionNumerators(cfg.deflectionClass, cfg.deflectionLimitNumerator);
    const kCr = kCrUitConfig(cfg);
    if ("fout" in kCr) {
      skipped.push({ beamId: beam.id, reason: kCr.fout });
      continue;
    }
    const duurPerCombinatie = data.loadCases ? belastingduurPerCombinatie({
      combinaties: ulsCombos,
      loadCases: data.loadCases,
      gevuld,
      ondergrens: cfg.loadDuration !== void 0 ? mapLoadDuration(cfg.loadDuration) : void 0
    }) : [];
    const staafNotities = [...lijn.notities.get(beam.id) ?? []];
    const alphaNotitie = alphaCrStaafNotitie(
      ruweData.stabiliteit,
      Math.min(...forcesEnvelope.map((p) => p.forces.n_ed)),
      Number.isFinite(cfg.bucklingLengthY_m) && cfg.bucklingLengthY_m > 0
    );
    if (alphaNotitie) staafNotities.push(alphaNotitie);
    inputs.push({
      beam_id: beam.id,
      width_mm: bMm,
      height_mm: hMm,
      // Aanwezig = samengestelde doorsnede uit de profieleditor; de kern
      // rekent dan met de lamellen in plaats van met b × h. Afwezig = de
      // rechthoek hierboven, precies zoals voorheen.
      ...custom ? { custom_section: custom } : {},
      strength_class: grade,
      service_class: mapServiceClass(cfg.serviceClass),
      // Met de lijst per combinatie is dit alleen nog de terugval voor een
      // combinatie die er niet in staat; de LANGSTE klasse is de veilige kant.
      load_duration: duurPerCombinatie.length > 0 ? langsteKlasse(duurPerCombinatie.map((d) => d.load_duration)) : mapLoadDuration(cfg.loadDuration),
      load_duration_per_combination: duurPerCombinatie,
      length_m: lengthMm / 1e3,
      forces_envelope: forcesEnvelope,
      // Kniklengtes per as; leeg → systeemlengte, net als bij staal.
      //
      // De houtkern gebruikt ze allebei echt: in
      // nen-en-1995-1-1/src/stability.rs volgt lambda = L_cr / i, en daaruit
      // via art. 6.3.2 verg. (6.21)/(6.22) de relatieve slankheid en de
      // knikfactoren k_c,y en k_c,z van (6.23)/(6.24). L_cr,z gaat daarnaast
      // naar de drukterm van de kiptoets (6.35).
      //
      // Tot september 2026 stond hier de systeemlengte hard ingevuld en waren
      // de invoervelden voor hout verborgen. Gevolg: een houten kolom die
      // halverwege om de zwakke as gesteund is, of een spant met een
      // gordingsteun, viel niet te modelleren — de toetsing rekende altijd
      // met de volle systeemlengte. Dat is veilig-zijdig maar onbruikbaar.
      // De velden zijn nu zichtbaar (FemProperties / BarPropertiesDialog) en
      // komen hier binnen.
      //
      // Geen extra validatie hier: beide invoerpaden schrijven alleen een
      // eindige waarde > 0 weg (BarPropertiesDialog.buildCheckConfig, en
      // valideerModel keurt het veld met `positief: true`).
      //
      // Sinds september 2026 gaat een leeg veld als 0 = "niet opgegeven" door.
      // De kern kiest dan zelf en zet de herkomst in de kolomtoets en in de
      // drukterm van de kiptoets: om y de staaflengte, om z de grootste
      // afstand tussen plaatsen met een steun aan de boven- ÉN onderrand
      // (`lateral_bracing` hieronder), anders de staaflengte.
      buckling_length_y_m: cfg.bucklingLengthY_m ?? 0,
      buckling_length_z_m: cfg.bucklingLengthZ_m ?? 0,
      // Zijdelingse steunen per rand — ALLEEN voor de kniklengte om z. Dezelfde
      // twee lijsten als bij staal (boven = bovenrand, onder = onderrand). De
      // kipsteunafstand hieronder blijft er uitdrukkelijk los van.
      lateral_bracing: {
        top_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraints),
        bottom_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraintsBottom)
      },
      // Kipsteunafstand voor tabel 6.1; 0 → staaflengte.
      //
      // Dit is de ℓ waaruit tabel 6.1 de meewerkende lengte l_ef maakt
      // (l_ef = verhouding · ℓ, met 1,0 / 0,9 / 0,8 voor een ligger op twee
      // steunpunten en 0,5 / 0,8 voor een uitkraging). l_ef gaat naar
      // σ_m,crit in (6.31)/(6.32) en daarmee naar k_crit in (6.33)/(6.35):
      // een kleinere steunafstand geeft een hogere kritieke buigspanning en
      // dus een lichtere kiptoets.
      //
      // Het is een EIGEN veld en geen afgeleide van cfg.lateralRestraints.
      // Die fracties zijn per FLENS en horen bij het staalmodel; art. 6.3.3
      // kent dat onderscheid niet en vraagt één afstand. Uit de fracties
      // afleiden zou l_ef stilzwijgend verkleinen op grond van invoer die
      // over iets anders gaat — precies de stille gunst die deze bouwer
      // nergens maakt.
      //
      // Terugval is de STAAFLENGTE en niet L_cr,z: dat zijn twee
      // verschillende grootheden. L_cr,z is de kniklengte om de zwakke as
      // (art. 6.3.2) en kan door een steun aan één flens al korter zijn,
      // terwijl kip de hele doorsnede laat uitwijken en torderen.
      //
      // Geen eigen validatie: alleen een eindige waarde > 0 gaat door; al
      // het andere (leeg, 0, negatief, NaN) wordt 0 en dan neemt de kern de
      // staaflengte — de veilige kant, want de volle lengte geeft de laagste
      // σ_m,crit.
      ltb_segment_length_m: Number.isFinite(cfg.ltbSupportSpacing_m) && cfg.ltbSupportSpacing_m > 0 ? cfg.ltbSupportSpacing_m : 0,
      ltb_load_case: "UniformLoad",
      // Aangrijpingspunt van de belasting (tabel 6.1, voetnoot a): aan de
      // drukzijde l_ef + 2h, aan de trekzijde l_ef − 0,5h. Leeg = zwaartepunt,
      // het gedrag van vóór dit veld. Een dak of vloer op de bovenrand van een
      // vrij opgelegde ligger is een last aan de drukzijde — de ongunstige
      // kant, en dus een keuze die de constructeur zelf maakt.
      ltb_load_position: mapLtbLoadPosition(cfg.ltbLoadPosition),
      ltb_effective_length_override_m: 0,
      // Kiptoets art. 6.3.3 aan/uit. `false` = de gedrukte rand is over de
      // volle lengte zijdelings gesteund en de opleggingen laten geen torsie
      // toe, zodat k_crit = 1,0 (art. 6.3.3(5)); buiging is dan al getoetst
      // in 6.1.6 en druk in 6.3.2. De kern laat de toets dan niet stil weg
      // maar zet hem als "niet van toepassing" met deze reden in het
      // resultaat. Leeg = aan, het gedrag van vóór dit veld.
      perform_ltb_check: cfg.performLtbCheck ?? true,
      // Scheurfactor voor dwarskracht, b_ef = k_cr · b uit EN 1995-1-1+A2
      // (6.13a). De Eurocode beveelt 0,67 aan voor gezaagd en gelijmd
      // gelamineerd hout, maar laat de keuze uitdrukkelijk aan de nationale
      // bijlage. NEN-EN 1995-1-1/NB:2013 bij 6.1.7 schrijft voor liggers met
      // een prismatische doorsnede k_cr = 1,0 voor; de 0,8 daar geldt alleen
      // voor I- en T-profielen met een dun lijf.
      //
      // Dus: 1,0 is de normwaarde en de standaard (`K_CR_STANDAARD`). Wie
      // met de aanbevolen 0,67 wil rekenen, zet dat in `cfg.kCr`; de kern
      // vermeldt de gebruikte waarde met bron in de dwarskrachttoets. Een
      // waarde buiten (0, 1] is hierboven al geweigerd (`kCrUitConfig`).
      //
      // LET OP — dit geldt alleen voor de RECHTHOEK. Voor een samengestelde
      // doorsnede leest de NB k_cr af uit de verhouding lijfdikte /
      // flensbreedte (0,8 zodra het lijf dunner is dan de halve flens), en
      // die verhouding kent deze bouwer niet — de kern wél. De kern negeert
      // dit veld daarom bij een niet-rechthoekige doorsnede en bepaalt k_cr
      // zelf; zie `shear::k_cr_nb` en de toelichting bij `check_timber_beam`.
      k_cr: kCr.kCr,
      load_sharing: false,
      deflection_inst_mm: wInstMm,
      // Zakking onder de quasi-blijvende BGT-combinatie (G + Σ ψ₂,i · Q_k,i),
      // of de volle last mét notitie als die combinatie ontbreekt — zie
      // `quasiPermanentDeflection`.
      deflection_quasi_perm_mm: wQuasi.mm,
      // Blijvend deel onbekend → 0, dus w_add = w_fin (veilig-zijdig).
      deflection_permanent_mm: 0,
      deflection_limit_fin: defl.fin,
      deflection_limit_add: defl.add,
      // Referentielijn + eventuele waarschuwing over een doorgeknipte staaf
      // (gedeeld met de staalbouwer), gevolgd door de herkomst van w_qp.
      deflection_notes: [
        ...deflectionNotesFor(beam, data.nodes, data.beams, data.supports),
        ...instNotes,
        ...wQuasi.notes
      ],
      // De toelichting bij een doorgaande lijn die als een staaf is getoetst;
      // de kern zet hem bij de kolomtoets, de kiptoets en de eindzakking.
      ...staafNotities.length > 0 ? { staaf_notities: staafNotities } : {}
    });
  }
  return { inputs, skipped };
}

// src/lib/cltCheckBuilder.ts
var CLT_STROOKBREEDTE_MM = 1e3;
function standaardRichting(index) {
  return index % 2 === 0 ? "Longitudinal" : "Transverse";
}
function isCltProfiel(profileName) {
  return /^\s*CLT\b/i.test(profileName ?? "");
}
var LAAG_TOKEN = /^(\d+(?:[.,]\d+)?)([LD])?(?::([A-Za-z]+\d+[A-Za-z]*))?$/i;
function parseCltProfiel(profileName, standaardKlasse) {
  const naam = profileName?.trim();
  if (!naam) return null;
  const m = /^CLT\s+(\S+)(?:\s+b\s*=?\s*(\d+(?:[.,]\d+)?))?$/i.exec(naam);
  if (!m) return null;
  const breedte = m[2] ? parseFloat(m[2].replace(",", ".")) : CLT_STROOKBREEDTE_MM;
  if (!(breedte > 0)) return null;
  const tokens = m[1].split("/");
  if (tokens.length < 3) return null;
  const layers = [];
  for (let i = 0; i < tokens.length; i++) {
    const tm = LAAG_TOKEN.exec(tokens[i]);
    if (!tm) return null;
    const dikte = parseFloat(tm[1].replace(",", "."));
    if (!(dikte > 0)) return null;
    const richting2 = tm[2] ? tm[2].toUpperCase() === "L" ? "Longitudinal" : "Transverse" : standaardRichting(i);
    layers.push({
      thickness_mm: dikte,
      orientation: richting2,
      strength_class: tm[3] ?? standaardKlasse
    });
  }
  return { width_mm: breedte, layers };
}
function cltMechanica(layup, eVanKlasse) {
  if (!(layup.width_mm > 0) || layup.layers.length === 0) return null;
  const lagen = [];
  let z = 0;
  let ea = 0;
  let eaz = 0;
  for (const l of layup.layers) {
    if (!(l.thickness_mm > 0)) return null;
    const e0 = eVanKlasse(l.strength_class);
    if (e0 === void 0) return null;
    const e = l.orientation === "Longitudinal" ? e0 : 0;
    const zBoven = z;
    const zOnder = z + l.thickness_mm;
    z = zOnder;
    const a = layup.width_mm * l.thickness_mm;
    ea += e * a;
    eaz += e * a * (zBoven + zOnder) / 2;
    lagen.push({ zBoven, zOnder, e, richting: l.orientation });
  }
  if (!(ea > 0)) return null;
  const z0 = eaz / ea;
  return { breedte: layup.width_mm, hoogte: z, z0, eiEf: eiEfVan(layup.width_mm, z0, lagen), eaEf: ea, lagen };
}
function eiEfVan(b, z0, lagen) {
  let ei = 0;
  for (const l of lagen) {
    if (l.e === 0) continue;
    const t = l.zOnder - l.zBoven;
    const arm = (l.zBoven + l.zOnder) / 2 - z0;
    ei += l.e * (b * t * t * t / 12 + b * t * arm * arm);
  }
  return ei;
}
function cltSolverDoorsnede(layup, eVanKlasse) {
  const mech = cltMechanica(layup, eVanKlasse);
  if (!mech) return null;
  const eRef = mech.lagen.find((l) => l.e > 0)?.e;
  if (!eRef) return null;
  return {
    E: eRef,
    A: mech.eaEf / eRef,
    I: mech.eiEf / eRef,
    aBruto: mech.breedte * mech.hoogte
  };
}
function buildCltCheckInputs(ruweData) {
  const data = toetsdataInReferentierichting(ruweData);
  const inputs = [];
  const skipped = [];
  const grades = data.supportedGrades && data.supportedGrades.length > 0 ? data.supportedGrades : SUPPORTED_TIMBER_GRADES;
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const metLast = data.gevallenMetLast ? new Set(data.gevallenMetLast) : null;
  const gevuld = metLast ? (id) => metLast.has(id) : void 0;
  for (const beam of data.beams) {
    if (!isCltProfiel(beam.profile)) continue;
    const materialName = beam.material?.trim() ?? "";
    const grade = matchSupportedTimberGrade(materialName, grades);
    if (!grade) {
      skipped.push({
        beamId: beam.id,
        reason: `materiaal "${materialName || "\u2014"}" is geen ondersteunde sterkteklasse voor de lamellen \u2014 kies bijv. C24`
      });
      continue;
    }
    const layup = parseCltProfiel(beam.profile, grade);
    if (!layup) {
      skipped.push({
        beamId: beam.id,
        reason: `profiel "${beam.profile}" is geen geldige CLT-opbouw \u2014 gebruik bijv. "CLT 40/20/40/20/40" (lagen van boven naar beneden, optioneel L/D en :klasse per laag, optioneel b600)`
      });
      continue;
    }
    const onbekend = layup.layers.find((l) => !matchSupportedTimberGrade(l.strength_class, grades));
    if (onbekend) {
      skipped.push({
        beamId: beam.id,
        reason: `sterkteklasse "${onbekend.strength_class}" in de opbouw is onbekend \u2014 bekend zijn ${grades.join(", ")}`
      });
      continue;
    }
    if (!layup.layers.some((l) => l.orientation === "Longitudinal")) {
      skipped.push({ beamId: beam.id, reason: "de CLT-opbouw heeft geen lengtelaag \u2014 niets draagt in de spanrichting" });
      continue;
    }
    const lengthMm = beamLengthMm(beam, data.nodes);
    if (lengthMm <= 0) {
      skipped.push({ beamId: beam.id, reason: "staaflengte is 0 \u2014 knopen ontbreken" });
      continue;
    }
    const hasAnyResult = ulsCombos.some((c) => data.combinationResults.get(c.id)?.elements.has(beam.id));
    if (!hasAnyResult) {
      skipped.push({
        beamId: beam.id,
        reason: "geen krachtsverloop in de UGT-combinaties \u2014 reken het model eerst door"
      });
      continue;
    }
    const cfg = beam.checkConfig ?? {};
    const kCr = kCrUitConfig(cfg);
    if ("fout" in kCr) {
      skipped.push({ beamId: beam.id, reason: kCr.fout });
      continue;
    }
    const duurPerCombinatie = data.loadCases ? belastingduurPerCombinatie({
      combinaties: ulsCombos,
      loadCases: data.loadCases,
      gevuld,
      ondergrens: cfg.loadDuration !== void 0 ? mapLoadDuration(cfg.loadDuration) : void 0
    }) : [];
    inputs.push({
      beam_id: beam.id,
      layup,
      service_class: mapServiceClass(cfg.serviceClass),
      load_duration: duurPerCombinatie.length > 0 ? langsteKlasse(duurPerCombinatie.map((d) => d.load_duration)) : mapLoadDuration(cfg.loadDuration),
      load_duration_per_combination: duurPerCombinatie,
      length_m: lengthMm / 1e3,
      forces_envelope: buildForcesEnvelope(beam.id, ulsCombos, data.combinationResults),
      // NB bij 6.1.7: k_cr = 1,0 voor liggers met een prismatische doorsnede;
      // een opgegeven `cfg.kCr` gaat door, buiten (0, 1] is hierboven al
      // geweigerd. Dezelfde regel als in de houtbouwer (`kCrUitConfig`).
      k_cr: kCr.kCr,
      load_sharing: false
    });
  }
  return { inputs, skipped };
}

// src/lib/betonCheckBuilder.ts
var SUPPORTED_CONCRETE_CLASSES = [
  "C12/15",
  "C16/20",
  "C20/25",
  "C25/30",
  "C30/37",
  "C35/45",
  "C40/50",
  "C45/55",
  "C50/60",
  "C55/67",
  "C60/75",
  "C70/85",
  "C80/95",
  "C90/105"
];
var SUPPORTED_REINFORCEMENT_GRADES = ["B500A", "B500B", "B500C"];
function matchSupportedConcreteClass(materialName, supportedClasses = SUPPORTED_CONCRETE_CLASSES) {
  if (!materialName) return null;
  const gezocht = materialName.replace(/\s/g, "").toLowerCase();
  if (!gezocht) return null;
  const hit = supportedClasses.find((c) => c.toLowerCase() === gezocht);
  return hit ?? null;
}
function parseConcreteRectMm(profileName) {
  const name = profileName?.trim();
  if (!name) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i.exec(name);
  if (!m) return null;
  const bMm = parseFloat(m[1].replace(",", "."));
  const hMm = parseFloat(m[2].replace(",", "."));
  if (bMm > 0 && hMm > 0) return { bMm, hMm };
  return null;
}
var VORM_VOORVOEGSEL = { T: "Tee", L: "Ell" };
var BETON_PROFIEL_VOORBEELDEN = '"300x500" (rechthoek), "T 400x450 bw=200 hf=50" (T-ligger) of "L 400x450 bw=200 hf=50" (L-ligger)';
function getal(t) {
  return parseFloat(t.replace(",", "."));
}
function parseConcreteSection(profileName) {
  const naam = profileName?.trim();
  if (!naam) {
    return { ok: false, reden: `er is geen doorsnede opgegeven \u2014 gebruik ${BETON_PROFIEL_VOORBEELDEN}` };
  }
  const rect = parseConcreteRectMm(naam);
  if (rect) {
    return {
      ok: true,
      doorsnede: {
        shape: "Rectangle",
        b_mm: rect.bMm,
        h_mm: rect.hMm,
        b_w_mm: null,
        h_f_mm: null,
        flange_at_bottom: false
      }
    };
  }
  const kop = /^([TL])\s+(.*)$/i.exec(naam);
  if (!kop) {
    return {
      ok: false,
      reden: `doorsnede "${naam}" is geen herkenbare betondoorsnede \u2014 gebruik ${BETON_PROFIEL_VOORBEELDEN}`
    };
  }
  const shape = VORM_VOORVOEGSEL[kop[1].toUpperCase()];
  const rest = kop[2].trim();
  const maten = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(rest);
  if (!maten) {
    return {
      ok: false,
      reden: `doorsnede "${naam}": na "${kop[1].toUpperCase()}" horen de flensbreedte en de totale hoogte te staan als "b\xD7h", bijvoorbeeld "${kop[1].toUpperCase()} 400x450 bw=200 hf=50"`
    };
  }
  const bMm = getal(maten[1]);
  const hMm = getal(maten[2]);
  let bW = null;
  let hF = null;
  let flensOnder = false;
  const tokens = maten[3].trim().split(/\s+/).filter((t) => t.length > 0);
  for (const token of tokens) {
    const kv = /^([A-Za-z_]+)\s*=\s*(.+)$/.exec(token);
    if (!kv) {
      return {
        ok: false,
        reden: `doorsnede "${naam}": "${token}" is geen sleutel=waarde \u2014 verwacht bw=\u2026, hf=\u2026 of flens=onder`
      };
    }
    const sleutel = kv[1].toLowerCase();
    const waarde = kv[2];
    if (sleutel === "bw") bW = getal(waarde);
    else if (sleutel === "hf") hF = getal(waarde);
    else if (sleutel === "flens") {
      const w = waarde.toLowerCase();
      if (w !== "onder" && w !== "boven") {
        return {
          ok: false,
          reden: `doorsnede "${naam}": flens="${waarde}" bestaat niet \u2014 gebruik flens=onder of flens=boven (standaard boven)`
        };
      }
      flensOnder = w === "onder";
    } else {
      return {
        ok: false,
        reden: `doorsnede "${naam}": sleutel "${kv[1]}" is onbekend \u2014 verwacht bw=\u2026, hf=\u2026 of flens=onder`
      };
    }
  }
  const vorm = shape === "Tee" ? "T-vorm" : "L-vorm";
  if (bW === null) {
    return { ok: false, reden: `doorsnede "${naam}": de ${vorm} mist de lijfbreedte \u2014 voeg bw=\u2026 toe (in mm)` };
  }
  if (hF === null) {
    return { ok: false, reden: `doorsnede "${naam}": de ${vorm} mist de flensdikte \u2014 voeg hf=\u2026 toe (in mm)` };
  }
  if (!(bMm > 0 && hMm > 0 && bW > 0 && hF > 0)) {
    return { ok: false, reden: `doorsnede "${naam}": alle maten moeten groter dan nul zijn` };
  }
  if (bW >= bMm) {
    return {
      ok: false,
      reden: `doorsnede "${naam}": de lijfbreedte bw=${bW} is niet kleiner dan de flensbreedte ${bMm} \u2014 dan is het een rechthoek, schrijf "${bMm}x${hMm}"`
    };
  }
  if (hF >= hMm) {
    return {
      ok: false,
      reden: `doorsnede "${naam}": de flensdikte hf=${hF} laat geen lijf over binnen de hoogte ${hMm}`
    };
  }
  return {
    ok: true,
    doorsnede: {
      shape,
      b_mm: bMm,
      h_mm: hMm,
      b_w_mm: bW,
      h_f_mm: hF,
      flange_at_bottom: flensOnder
    }
  };
}

// src/lib/vrijMateriaal.ts
var PATROON = /^\s*VRIJ:\s*(.+?)\s+E\s*=\s*([\d.,]+)\s+rho\s*=\s*([\d.,]+)\s+f\s*=\s*([\d.,]+)(?:\s+gM\s*=\s*([\d.,]+))?\s*$/i;
function isVrijMateriaal(material) {
  return /^\s*VRIJ:/i.test(material ?? "");
}
function getal2(tekst) {
  return parseFloat(tekst.replace(",", "."));
}
function parseVrijMateriaal(material) {
  const m = PATROON.exec(material ?? "");
  if (!m) return null;
  const naam = m[1].trim();
  const eMod = getal2(m[2]);
  const dichtheid = getal2(m[3]);
  const fToel = getal2(m[4]);
  const gammaM = m[5] !== void 0 ? getal2(m[5]) : 1;
  if (!naam) return null;
  if (!(eMod > 0) || !(dichtheid >= 0) || !(fToel > 0) || !(gammaM > 0)) return null;
  return { naam, eMod, dichtheid, fToel, gammaM };
}

// src/lib/variantInvoer.ts
function materiaalVanStaaf(beam) {
  if (isVrijMateriaal(beam.material)) return "vrij";
  if (isCltProfiel(beam.profile)) return "clt";
  if (matchSupportedConcreteClass(beam.material) !== null) return "beton";
  if (matchSupportedTimberGrade(beam.material) !== null) return "hout";
  if (isSteelProfile(beam.profile)) return "staal";
  return "onbekend";
}

// src/lib/combinatieSelectie.ts
var LABEL_ZUIVER_STAAL = "niet gebruikt";
function redenZuiverStaal(combo) {
  const frequent = soortVanCombinatie(combo) === "6.15b";
  const uitdrukking2 = frequent ? "6.15b" : "6.16b";
  const gebruiker = frequent ? "de scheurbeheersing van beton (EN 1992-1-1 \xA77.3; de nationale bijlage bij 7.3.1(5) schrijft juist deze combinatie voor)" : "de kruipvervorming van hout en de BGT-tak van beton";
  return `"${combo.name}" (NEN-EN 1990 uitdrukking ${uitdrukking2}) is niet doorgerekend: elke staaf in dit model is staal. De doorbuigingstoets van staal gebruikt de karakteristieke BGT-combinatie (6.14); deze combinatie voedt ${gebruiker}. Voeg een houten of betonnen staaf toe \u2014 of wijzig de combinatie zelf \u2014 en hij wordt weer meegenomen.`;
}
function isZuivereStaalconstructie(beams, plates = []) {
  if (beams.length === 0) return false;
  if (!beams.every((b) => materiaalVanStaaf(b) === "staal")) return false;
  return plates.every((p) => (p.E ?? PLATE_DEFAULTS.E) === PLATE_DEFAULTS.E);
}
function zelfdeFactoren(a, b) {
  if (a.size !== b.size) return false;
  for (const [caseId, factor] of a) {
    if (b.get(caseId) !== factor) return false;
  }
  return true;
}
function isOngewijzigd(combo, standaard) {
  return combo.name === standaard.name && combo.type === standaard.type && combo.formula === standaard.formula && zelfdeFactoren(combo.factors, standaard.factors);
}
function selecteerCombinaties(combinations, beams, plates = [], opties = {}) {
  const redenPerId = /* @__PURE__ */ new Map();
  if (!isZuivereStaalconstructie(beams, plates)) {
    return { actief: combinations, overgeslagen: [], redenPerId };
  }
  const kandidaten = new Map(
    genereerStandaardCombinaties(
      opties.loadCases ?? STANDAARD_BELASTINGGEVALLEN,
      opties.gevolgklasse ?? STANDAARD_GEVOLGKLASSE
    ).filter((c) => SOORTEN_BUITEN_STAAL.includes(c.standaard.soort)).map((c) => [c.standaard.sleutel, c])
  );
  const actief2 = [];
  const overgeslagen = [];
  for (const combo of combinations) {
    const standaard = combo.standaard ? kandidaten.get(combo.standaard.sleutel) : void 0;
    if (standaard && isOngewijzigd(combo, standaard)) {
      const reden = redenZuiverStaal(combo);
      overgeslagen.push({
        id: combo.id,
        naam: combo.name,
        label: LABEL_ZUIVER_STAAL,
        reden
      });
      redenPerId.set(combo.id, reden);
    } else {
      actief2.push(combo);
    }
  }
  return { actief: actief2, overgeslagen, redenPerId };
}

// src/lib/wind/windEurocode.ts
var WINDGEBIEDEN = {
  I: {
    vb0: 29.5,
    omschrijving: "Gebied I \u2014 kuststrook en Waddengebied (v_b,0 = 29,5 m/s)",
    bron: "NEN-EN 1991-1-4/NB tabel NB.1"
  },
  II: {
    vb0: 27,
    omschrijving: "Gebied II \u2014 noordwestelijk binnenland (v_b,0 = 27,0 m/s)",
    bron: "NEN-EN 1991-1-4/NB tabel NB.1"
  },
  III: {
    vb0: 24.5,
    omschrijving: "Gebied III \u2014 zuidoostelijk binnenland (v_b,0 = 24,5 m/s)",
    bron: "NEN-EN 1991-1-4/NB tabel NB.1"
  }
};
var TERREIN_CATEGORIEEN = {
  "0": {
    z0: 3e-3,
    zmin: 1,
    omschrijving: "0 \u2014 zee, aan open zee blootgesteld kustgebied (leeshulp: \u201Ckustgebied\u201D)",
    bron: "NEN-EN 1991-1-4 tabel 4.1"
  },
  I: {
    z0: 0.01,
    zmin: 1,
    omschrijving: "I \u2014 meren, vlak gebied zonder obstakels",
    bron: "NEN-EN 1991-1-4 tabel 4.1"
  },
  II: {
    z0: 0.05,
    zmin: 2,
    omschrijving: "II \u2014 lage begroeiing, losstaande obstakels (leeshulp: \u201Conbebouwd\u201D)",
    bron: "NEN-EN 1991-1-4 tabel 4.1"
  },
  III: {
    z0: 0.3,
    zmin: 5,
    omschrijving: "III \u2014 dorpen, voorstedelijk gebied, bos (leeshulp: \u201Cbebouwd\u201D)",
    bron: "NEN-EN 1991-1-4 tabel 4.1"
  },
  IV: {
    z0: 1,
    zmin: 10,
    omschrijving: "IV \u2014 stedelijk gebied, gemiddelde gebouwhoogte > 15 m",
    bron: "NEN-EN 1991-1-4 tabel 4.1"
  }
};
var Z0_II = 0.05;
var RHO_LUCHT = 1.25;
var C_DIR = 1;
var C_SEASON = 1;
var K_I = 1;
var C_O = 1;
function nl5(v, dec) {
  return v.toFixed(dec).replace(".", ",");
}
function berekenStuwdruk(gebied, terrein, ze_m) {
  const g = WINDGEBIEDEN[gebied];
  const t = TERREIN_CATEGORIEEN[terrein];
  const vb = C_DIR * C_SEASON * g.vb0;
  const kr = 0.19 * Math.pow(t.z0 / Z0_II, 0.07);
  const zGebruikt = Math.max(ze_m, t.zmin);
  const cr = kr * Math.log(zGebruikt / t.z0);
  const vm = cr * C_O * vb;
  const iv = K_I / (C_O * Math.log(zGebruikt / t.z0));
  const qp_Nm2 = (1 + 7 * iv) * 0.5 * RHO_LUCHT * vm * vm;
  return {
    qp_kNm2: qp_Nm2 / 1e3,
    ze_m,
    handmatig: false,
    afleiding: [
      { symbool: "windgebied", waarde: `${gebied} \u2014 v_b,0 = ${nl5(g.vb0, 1)} m/s`, bron: g.bron },
      { symbool: "terreincategorie", waarde: `${terrein} \u2014 z\u2080 = ${nl5(t.z0, 3)} m, z_min = ${nl5(t.zmin, 0)} m`, bron: t.bron },
      { symbool: "v_b", waarde: `${nl5(C_DIR, 1)} \xB7 ${nl5(C_SEASON, 1)} \xB7 ${nl5(g.vb0, 1)} = ${nl5(vb, 2)} m/s`, bron: "EN 1991-1-4 (4.1)" },
      { symbool: "z_e", waarde: `${nl5(ze_m, 2)} m${zGebruikt !== ze_m ? ` \u2192 gerekend met z_min = ${nl5(zGebruikt, 2)} m` : ""}`, bron: "EN 1991-1-4 \xA77.2.2 fig. 7.4" },
      { symbool: "k_r", waarde: `0,19 \xB7 (${nl5(t.z0, 3)}/${nl5(Z0_II, 3)})^0,07 = ${nl5(kr, 4)}`, bron: "EN 1991-1-4 (4.5)" },
      { symbool: "c_r(z_e)", waarde: `${nl5(kr, 4)} \xB7 ln(${nl5(zGebruikt, 2)}/${nl5(t.z0, 3)}) = ${nl5(cr, 4)}`, bron: "EN 1991-1-4 (4.4)" },
      { symbool: "c_o(z_e)", waarde: `${nl5(C_O, 2)} (vlak terrein, orografie buiten beschouwing)`, bron: "EN 1991-1-4 \xA74.3.3" },
      { symbool: "v_m(z_e)", waarde: `${nl5(cr, 4)} \xB7 ${nl5(C_O, 2)} \xB7 ${nl5(vb, 2)} = ${nl5(vm, 3)} m/s`, bron: "EN 1991-1-4 (4.3)" },
      { symbool: "I_v(z_e)", waarde: `${nl5(K_I, 1)} / (${nl5(C_O, 2)} \xB7 ln(${nl5(zGebruikt, 2)}/${nl5(t.z0, 3)})) = ${nl5(iv, 4)}`, bron: "EN 1991-1-4 (4.7)" },
      { symbool: "\u03C1", waarde: `${nl5(RHO_LUCHT, 2)} kg/m\xB3`, bron: "EN 1991-1-4 \xA74.5(1) opm. 2" },
      { symbool: "q_p(z_e)", waarde: `[1 + 7\xB7${nl5(iv, 4)}] \xB7 \xBD \xB7 ${nl5(RHO_LUCHT, 2)} \xB7 ${nl5(vm, 3)}\xB2 = ${nl5(qp_Nm2 / 1e3, 4)} kN/m\xB2`, bron: "EN 1991-1-4 (4.8)" }
    ]
  };
}
function handmatigeStuwdruk(qp_kNm2, ze_m) {
  return {
    qp_kNm2,
    ze_m,
    handmatig: true,
    afleiding: [
      {
        symbool: "q_p(z_e)",
        waarde: `${nl5(qp_kNm2, 4)} kN/m\xB2 \u2014 handmatig ingevoerd op z_e = ${nl5(ze_m, 2)} m`,
        bron: "door de gebruiker opgegeven (bijv. NEN-EN 1991-1-4/NB stuwdruktabel)"
      }
    ]
  };
}
var TABEL_71 = [
  { hd: 5, A: -1.2, B: -0.8, C: -0.5, D: 0.8, E: -0.7 },
  { hd: 1, A: -1.2, B: -0.8, C: -0.5, D: 0.8, E: -0.5 },
  { hd: 0.25, A: -1.2, B: -0.8, C: -0.5, D: 0.7, E: -0.3 }
];
var TABEL_71_BRON = "NEN-EN 1991-1-4 tabel 7.1 (c_pe,10)";
function cpeWand(hOverD) {
  const hd = Math.max(0.25, Math.min(5, hOverD));
  for (let i = 0; i < TABEL_71.length - 1; i++) {
    const hoog = TABEL_71[i], laag = TABEL_71[i + 1];
    if (hd <= hoog.hd && hd >= laag.hd) {
      const f = (hd - laag.hd) / (hoog.hd - laag.hd);
      const mix = (a, b) => b + (a - b) * f;
      return {
        A: mix(hoog.A, laag.A),
        B: mix(hoog.B, laag.B),
        C: mix(hoog.C, laag.C),
        D: mix(hoog.D, laag.D),
        E: mix(hoog.E, laag.E)
      };
    }
  }
  const r = TABEL_71[TABEL_71.length - 1];
  return { A: r.A, B: r.B, C: r.C, D: r.D, E: r.E };
}
var CPE_PLAT_DAK = {
  F: -1.8,
  G: -1.2,
  H: -0.7,
  I: -0.2
};
var CPE_PLAT_DAK_BRON = "NEN-EN 1991-1-4 tabel 7.2, scherpe dakrand (c_pe,10)";
var MELDING_ZONE_I = "Zone I van een plat dak geeft in tabel 7.2 zowel +0,2 als \u22120,2. De generator gebruikt \u22120,2 (opwaarts). Controleer of +0,2 (neerwaarts) voor uw geval maatgevend is; die variant wordt niet automatisch aangemaakt.";
var CPI_ONBEKEND = [0.2, -0.3];
var CPI_BRON = "NEN-EN 1991-1-4 \xA77.2.9 (\u03BC onbekend \u2192 meest ongunstige van +0,2 en \u22120,3)";
var CSCD_GRENSHOOGTE_M = 15;
var CSCD_BRON = "NEN-EN 1991-1-4 \xA76.2(1)a (c_s\xB7c_d = 1,0 voor gebouwen < 15 m)";
var CPE10_MIN_OPPERVLAK_M2 = 10;
var CPE10_BRON = "NEN-EN 1991-1-4 \xA77.2.1(1)";
var ZMAX_M = 200;
function berekenE(b_m, h_m) {
  return Math.min(b_m, 2 * h_m);
}

// src/lib/wind/windGenerator.ts
var STANDAARD_WIND_INSTELLINGEN = {
  windgebied: "II",
  terreincategorie: "II",
  stuwdrukBron: "berekend",
  qpHandmatig_kNm2: 1,
  richtingLinks: true,
  richtingRechts: true,
  richtingHaaks: false,
  cpiKeuze: "beide",
  cpiHandmatig: 0.2,
  hohSpant_m: 5,
  positieSpant: "tussenspant",
  belastingbreedteOverride_m: null,
  gebouwlengte_m: 30,
  afstandTotKopgevel_m: 15,
  cpeDakLoef: null,
  cpeDakLij: null,
  cpeDakHaaks: null,
  combinatiesGenereren: true,
  gevelhoogte_m: null
};
var nl6 = (v, d) => v.toFixed(d).replace(".", ",");
var RICHTING_LABEL = {
  links: "wind van links",
  rechts: "wind van rechts",
  haaks: "wind haaks op het spant"
};
function staafGeo(beam, nodes) {
  const a = nodes.find((n) => n.id === beam.from);
  const b = nodes.find((n) => n.id === beam.to);
  if (!a || !b) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-9) return null;
  const ax = dx / L, az = dz / L;
  return {
    beam,
    rol: rolVanStaaf(beam, nodes),
    x1: a.x,
    z1: a.z,
    x2: b.x,
    z2: b.z,
    L_mm: L,
    ax,
    az,
    tx: -az,
    tz: ax,
    helling: Math.atan2(Math.abs(dz), Math.abs(dx)) * 180 / Math.PI
  };
}
function drukNaarLokaleLijnlast(w_kNm2, breedte_m, geo, nx, nz) {
  const nt = nx * geo.tx + nz * geo.tz;
  return -w_kNm2 * breedte_m * nt;
}
function dakNormaal(geo) {
  return geo.tz >= 0 ? { nx: geo.tx, nz: geo.tz } : { nx: -geo.tx, nz: -geo.tz };
}
function platDakBanden(e_m, d_m, randzoneF) {
  const grens1 = Math.min(e_m / 10, d_m);
  const grens2 = Math.min(e_m / 2, d_m);
  const banden = [];
  if (grens1 > 0) banden.push({ van_m: 0, tot_m: grens1, zone: randzoneF ? "F" : "G" });
  if (grens2 > grens1) banden.push({ van_m: grens1, tot_m: grens2, zone: "H" });
  if (d_m > grens2) banden.push({ van_m: grens2, tot_m: d_m, zone: "I" });
  if (banden.length > 0) {
    banden[0].van_m = Number.NEGATIVE_INFINITY;
    banden[banden.length - 1].tot_m = Number.POSITIVE_INFINITY;
  }
  return banden;
}
var WIND_COMBI_PREFIX = "Wind-gen \xB7 ";
function genereerWindbelasting(model, inst) {
  const meldingen = [];
  let geometrie = null;
  const fout = (tekst) => {
    meldingen.push({ niveau: "fout", tekst });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null, geometrie };
  };
  if (model.nodes.length < 2 || model.beams.length === 0) {
    return fout("Er is nog geen constructie om wind op te zetten.");
  }
  const geos = model.beams.map((b) => staafGeo(b, model.nodes)).filter((g) => g !== null).sort((a, b) => a.beam.id - b.beam.id);
  const zs = model.nodes.map((n) => n.z);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const modelhoogte_m = (maxZ - minZ) / 1e3;
  if (modelhoogte_m <= 0) return fout("De constructie heeft geen hoogte \u2014 wind is niet te bepalen.");
  const gevelL = geos.filter((g) => g.rol === "gevelLinks");
  const gevelR = geos.filter((g) => g.rol === "gevelRechts");
  const xsAlles = model.nodes.map((n) => n.x);
  const xLinks = gevelL.length > 0 ? Math.min(...gevelL.flatMap((g) => [g.x1, g.x2])) : Math.min(...xsAlles);
  const xRechts = gevelR.length > 0 ? Math.max(...gevelR.flatMap((g) => [g.x1, g.x2])) : Math.max(...xsAlles);
  const d_m = (xRechts - xLinks) / 1e3;
  if (d_m <= 0) return fout("De constructie heeft geen breedte \u2014 wind is niet te bepalen.");
  const heeftGevels = gevelL.length > 0 || gevelR.length > 0;
  const kapZonderGevel = !heeftGevels && inst.gevelhoogte_m !== null && inst.gevelhoogte_m > 0;
  const h_m = modelhoogte_m + (kapZonderGevel ? inst.gevelhoogte_m : 0);
  const heeftHellendDak = geos.some((g) => g.rol === "dakHellend");
  geometrie = {
    h_m,
    modelhoogte_m,
    d_m,
    xLinks_m: xLinks / 1e3,
    xRechts_m: xRechts / 1e3,
    heeftHellendDak,
    heeftGevels,
    kapZonderGevel,
    dakhelling_graden: Math.max(0, ...geos.filter((g) => g.rol === "dakHellend").map((g) => g.helling)),
    staven: geos.map((g) => ({
      beamId: g.beam.id,
      rol: g.rol,
      x1: g.x1 / 1e3,
      z1: g.z1 / 1e3,
      x2: g.x2 / 1e3,
      z2: g.z2 / 1e3
    }))
  };
  if (kapZonderGevel) {
    meldingen.push({
      niveau: "info",
      tekst: `Kap zonder gevel: de gevels staan niet in het model. Bouwhoogte h = ${nl6(inst.gevelhoogte_m, 2)} m (gevel) + ${nl6(modelhoogte_m, 2)} m (kap) = ${nl6(h_m, 2)} m. De windlast op de gevels zelf is niet gegenereerd; die valt op de wanden en niet op dit spant.`
    });
  } else if (!heeftGevels) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Geen enkele staaf heeft het belastingtype linker- of rechtergevel. Staan de gevels wel in het model, controleer dan de belastingtypen in de staafeigenschappen. Is dit een kap op wanden die niet getekend zijn, vul dan de gevelhoogte in: de stuwdruk hoort bij de werkelijke bouwhoogte."
    });
  }
  if (!(inst.hohSpant_m > 0)) return fout("Vul een h.o.h.-afstand van de spanten in (> 0 m).");
  if (!(inst.gebouwlengte_m > 0)) return fout("Vul de gebouwlengte haaks op het spant in (> 0 m).");
  if (!inst.richtingLinks && !inst.richtingRechts && !inst.richtingHaaks) {
    return fout("Kies minstens \xE9\xE9n windrichting.");
  }
  const breedte_m = inst.belastingbreedteOverride_m !== null && inst.belastingbreedteOverride_m > 0 ? inst.belastingbreedteOverride_m : inst.positieSpant === "kopgevelspant" ? inst.hohSpant_m / 2 : inst.hohSpant_m;
  if (heeftHellendDak) {
    if (inst.cpeDakLoef === null || inst.cpeDakLij === null) {
      return fout(
        "Er zijn staven met belastingtype \u201Chellend dak\u201D, maar de vormfactoren voor het loef- en lijdakvlak zijn niet ingevuld. Deze generator vult tabel 7.4a van NEN-EN 1991-1-4 niet zelf in: de waarden hangen af van de dakhelling en de windrichting. Lees c_pe,10 op in tabel 7.4a en vul beide velden in."
      );
    }
    if (inst.richtingHaaks && inst.cpeDakHaaks === null) {
      return fout(
        "Wind haaks op het spant met een hellend dak vraagt de vormfactor uit NEN-EN 1991-1-4 tabel 7.4b (\u03B8 = 90\xB0). Vul die in, of zet de windrichting \u201Chaaks\u201D uit."
      );
    }
  }
  const ze_m = h_m;
  const stuwdruk = inst.stuwdrukBron === "handmatig" ? handmatigeStuwdruk(inst.qpHandmatig_kNm2, ze_m) : berekenStuwdruk(inst.windgebied, inst.terreincategorie, ze_m);
  if (inst.stuwdrukBron === "handmatig" && !(inst.qpHandmatig_kNm2 > 0)) {
    return fout("Vul een stuwdruk groter dan 0 kN/m\xB2 in, of kies \u201Cberekenen\u201D.");
  }
  if (stuwdruk.handmatig) {
    meldingen.push({
      niveau: "info",
      tekst: `De stuwdruk is handmatig opgegeven (${nl6(stuwdruk.qp_kNm2, 3)} kN/m\xB2); de generator heeft hem niet zelf afgeleid.`
    });
  } else {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De stuwdruk is berekend met de ruwheidslengtes uit EN 1991-1-4 tabel 4.1. De Nederlandse nationale bijlage geeft de extreme stuwdruk ook rechtstreeks in tabelvorm per windgebied, terreinsoort en hoogte; die waarde kan afwijken. Houdt u die tabel aan, kies dan \u201Cstuwdruk handmatig\u201D en voer de waarde uit de nationale bijlage in."
    });
  }
  meldingen.push({
    niveau: "info",
    tekst: `Referentiehoogte z_e = ${nl6(ze_m, 2)} m (bouwhoogte) voor ALLE vlakken. Volgens NEN-EN 1991-1-4 \xA77.2.2 (figuur 7.4) mag dat wanneer h \u2264 b; bij een hoger gebouw is \xE9\xE9n strook op z_e = h de veilige kant, want de stuwdruk is daar het grootst.`
  });
  if (ze_m > ZMAX_M) {
    meldingen.push({
      niveau: "fout",
      tekst: `De bouwhoogte (${nl6(ze_m, 1)} m) ligt boven z_max = ${ZMAX_M} m; de snelheidsprofielformules van \xA74.3.2 gelden daar niet meer.`
    });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null, geometrie };
  }
  if (h_m >= CSCD_GRENSHOOGTE_M) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `De bouwhoogte is ${nl6(h_m, 1)} m. De generator rekent met c_s\xB7c_d = 1,0; dat mag zonder meer alleen onder ${CSCD_GRENSHOOGTE_M} m (${CSCD_BRON}). Bepaal c_s\xB7c_d volgens \xA76.3 en verhoog de lasten zo nodig zelf.`
    });
  }
  if (h_m > inst.gebouwlengte_m) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De bouwhoogte is groter dan de gebouwlengte (h > b). NEN-EN 1991-1-4 \xA77.2.2 verdeelt de loefgevel dan in stroken met een lagere stuwdruk onderin; de generator houdt conservatief \xE9\xE9n strook op z_e = h aan."
    });
  }
  const cpeW = cpeWand(h_m / d_m);
  const e_inVlak = berekenE(inst.gebouwlengte_m, h_m);
  const e_haaks = berekenE(d_m, h_m);
  const dakGeos = geos.filter((g) => g.rol === "dakPlat" || g.rol === "dakHellend");
  let xNok = (xLinks + xRechts) / 2;
  if (dakGeos.length > 0) {
    const hoogsteZ = Math.max(...dakGeos.flatMap((g) => [g.z1, g.z2]));
    const toppen = dakGeos.flatMap((g) => [
      { x: g.x1, z: g.z1 },
      { x: g.x2, z: g.z2 }
    ]).filter((p) => Math.abs(p.z - hoogsteZ) < 1);
    if (toppen.length > 0) xNok = toppen.reduce((s, p) => s + p.x, 0) / toppen.length;
  }
  const cpiWaarden = inst.cpiKeuze === "beide" ? [...CPI_ONBEKEND] : inst.cpiKeuze === "plus" ? [0.2] : inst.cpiKeuze === "min" ? [-0.3] : [inst.cpiHandmatig];
  if (inst.cpiKeuze === "beide") {
    meldingen.push({ niveau: "info", tekst: `Inwendige druk: beide waarden \xB1. ${CPI_BRON}` });
  } else if (inst.cpiKeuze === "handmatig") {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `Inwendige druk handmatig op c_pi = ${nl6(inst.cpiHandmatig, 2)}. Dat is alleen juist wanneer de openingsverhouding \u03BC van het gebouw bekend is (\xA77.2.9); anders is \u201Cbeide (+0,2 en \u22120,3)\u201D de norm-conforme keuze.`
    });
  }
  const richtingen = [
    ...inst.richtingLinks ? ["links"] : [],
    ...inst.richtingRechts ? ["rechts"] : [],
    ...inst.richtingHaaks ? ["haaks"] : []
  ];
  if (inst.richtingHaaks) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Wind haaks op het spant belast het spant uitsluitend met ZUIGING op beide gevels (zones A/B/C, tabel 7.1) en op het dak. De zone-indeling loopt daarbij in de lengterichting van het gebouw; de generator houdt per vlak de ongunstigste zone aan die het spant raakt en verdeelt niet verder over de spanwijdte. Dat is de veilige kant, maar grover dan de norm."
    });
  }
  const gevallen = [];
  const lasten = [];
  const perGeval = [];
  let zoneIGebruikt = false;
  let kleinOppervlak = false;
  for (const richting2 of richtingen) {
    for (const cpi of cpiWaarden) {
      const sleutel = `wind:${richting2}:cpi${cpi >= 0 ? "+" : ""}${cpi.toFixed(2)}`;
      const naam = `Wind ${RICHTING_LABEL[richting2].replace("wind ", "")} (c_pi = ${nl6(cpi, 2)})`;
      gevallen.push({ sleutel, naam, richting: richting2, cpi });
      const regels = [];
      for (const g of geos) {
        const opp_m2 = breedte_m * (g.L_mm / 1e3);
        if (opp_m2 < CPE10_MIN_OPPERVLAK_M2 && g.rol !== "vloer" && g.rol !== "binnen") {
          kleinOppervlak = true;
        }
        const push = (zone, cpe, bron, nx, nz, cpiHier, startFrac, endFrac) => {
          const w = stuwdruk.qp_kNm2 * (cpe - cpiHier);
          const q = drukNaarLokaleLijnlast(w, breedte_m, g, nx, nz);
          const deel = startFrac !== void 0 ? ` (${nl6(startFrac, 2)}\u2013${nl6(endFrac ?? 1, 2)} van de staaf)` : "";
          regels.push({
            beamId: g.beam.id,
            rol: g.rol,
            zone: zone + deel,
            cpe,
            cpi: cpiHier,
            w_kNm2: w,
            q_kNm: q,
            bron,
            ...startFrac !== void 0 ? { startFrac, endFrac } : {}
          });
          if (Math.abs(q) < 1e-12) return;
          lasten.push({
            gevalSleutel: sleutel,
            beamId: g.beam.id,
            q,
            ...startFrac !== void 0 ? { startFrac, endFrac } : {},
            toelichting: `Staaf ${g.beam.id}, zone ${zone}${deel}: c_pe = ${nl6(cpe, 2)}, c_pi = ${nl6(cpiHier, 2)}, w = ${nl6(stuwdruk.qp_kNm2, 3)}\xB7(${nl6(cpe, 2)} \u2212 ${nl6(cpiHier, 2)}) = ${nl6(w, 3)} kN/m\xB2, q = w\xB7${nl6(breedte_m, 2)} m = ${nl6(Math.abs(q), 3)} kN/m`
          });
        };
        if (g.rol === "gevelLinks" || g.rol === "gevelRechts") {
          const nx = g.rol === "gevelLinks" ? -1 : 1;
          let zone, cpe;
          if (richting2 === "haaks") {
            const y = inst.afstandTotKopgevel_m;
            if (y < e_haaks / 5) {
              zone = "A";
              cpe = cpeW.A;
            } else if (y < e_haaks) {
              zone = "B";
              cpe = cpeW.B;
            } else {
              zone = "C";
              cpe = cpeW.C;
            }
          } else {
            const loef = richting2 === "links" && g.rol === "gevelLinks" || richting2 === "rechts" && g.rol === "gevelRechts";
            zone = loef ? "D" : "E";
            cpe = loef ? cpeW.D : cpeW.E;
          }
          push(zone, cpe, TABEL_71_BRON, nx, 0, cpi);
          continue;
        }
        if (g.rol === "dakPlat" || g.rol === "dakHellend") {
          const n = dakNormaal(g);
          if (richting2 === "haaks") {
            if (g.rol === "dakHellend") {
              push("dak \u03B8=90\xB0", inst.cpeDakHaaks, "NEN-EN 1991-1-4 tabel 7.4b (door de gebruiker ingevuld)", n.nx, n.nz, cpi);
            } else {
              const y = inst.afstandTotKopgevel_m;
              const zone = y < e_haaks / 10 ? "F" : y < e_haaks / 2 ? "H" : "I";
              if (zone === "I") zoneIGebruikt = true;
              push(zone, CPE_PLAT_DAK[zone], CPE_PLAT_DAK_BRON, n.nx, n.nz, cpi);
            }
            continue;
          }
          if (g.rol === "dakHellend") {
            const midX = (g.x1 + g.x2) / 2;
            const linkervlak = midX < xNok;
            const loef = richting2 === "links" && linkervlak || richting2 === "rechts" && !linkervlak;
            const cpe = loef ? inst.cpeDakLoef : inst.cpeDakLij;
            push(
              loef ? "loefdakvlak" : "lijdakvlak",
              cpe,
              "NEN-EN 1991-1-4 tabel 7.4a (door de gebruiker ingevuld)",
              n.nx,
              n.nz,
              cpi
            );
            continue;
          }
          const randzoneF = inst.positieSpant === "kopgevelspant" || inst.afstandTotKopgevel_m <= e_inVlak / 4;
          const banden = platDakBanden(e_inVlak, d_m, randzoneF);
          const xAccent = (xMm) => richting2 === "links" ? (xMm - xLinks) / 1e3 : (xRechts - xMm) / 1e3;
          const p1 = xAccent(g.x1), p2 = xAccent(g.x2);
          const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
          if (hi - lo < 1e-9) {
            const zone = banden.find((b) => lo >= b.van_m && lo <= b.tot_m)?.zone ?? "H";
            if (zone === "I") zoneIGebruikt = true;
            push(zone, CPE_PLAT_DAK[zone], CPE_PLAT_DAK_BRON, n.nx, n.nz, cpi);
            continue;
          }
          for (const band of banden) {
            const van = Math.max(lo, band.van_m), tot = Math.min(hi, band.tot_m);
            if (tot - van <= 1e-9) continue;
            const fracVan = p1 <= p2 ? (van - p1) / (p2 - p1) : (p1 - tot) / (p1 - p2);
            const fracTot = p1 <= p2 ? (tot - p1) / (p2 - p1) : (p1 - van) / (p1 - p2);
            const a = Math.max(0, Math.min(1, fracVan));
            const b = Math.max(0, Math.min(1, fracTot));
            if (b - a <= 1e-9) continue;
            const vol = a <= 1e-9 && b >= 1 - 1e-9;
            if (band.zone === "I") zoneIGebruikt = true;
            push(
              band.zone,
              CPE_PLAT_DAK[band.zone],
              CPE_PLAT_DAK_BRON,
              n.nx,
              n.nz,
              cpi,
              vol ? void 0 : a,
              vol ? void 0 : b
            );
          }
          continue;
        }
        if (g.rol === "overstek") {
          const n = dakNormaal(g);
          const midX = (g.x1 + g.x2) / 2;
          let cpeBoven, zoneBoven, bronBoven;
          if (g.helling > 5 && heeftHellendDak) {
            const linkervlak = midX < xNok;
            const loef = richting2 === "links" && linkervlak || richting2 === "rechts" && !linkervlak;
            cpeBoven = loef ? inst.cpeDakLoef : inst.cpeDakLij;
            zoneBoven = loef ? "loefdakvlak" : "lijdakvlak";
            bronBoven = "NEN-EN 1991-1-4 tabel 7.4a (door de gebruiker ingevuld)";
          } else {
            const xAcc = richting2 === "rechts" ? (xRechts - midX) / 1e3 : (midX - xLinks) / 1e3;
            const randzoneF = inst.positieSpant === "kopgevelspant" || inst.afstandTotKopgevel_m <= e_inVlak / 4;
            const banden = platDakBanden(e_inVlak, d_m, randzoneF);
            const z = banden.find((b) => xAcc >= b.van_m && xAcc <= b.tot_m)?.zone ?? (xAcc < 0 ? randzoneF ? "F" : "G" : "I");
            zoneBoven = z;
            cpeBoven = CPE_PLAT_DAK[z];
            bronBoven = CPE_PLAT_DAK_BRON;
            if (z === "I") zoneIGebruikt = true;
          }
          const aanLinkerzijde = midX < (xLinks + xRechts) / 2;
          let cpeOnder, zoneOnder;
          if (richting2 === "haaks") {
            const y = inst.afstandTotKopgevel_m;
            if (y < e_haaks / 5) {
              zoneOnder = "A";
              cpeOnder = cpeW.A;
            } else if (y < e_haaks) {
              zoneOnder = "B";
              cpeOnder = cpeW.B;
            } else {
              zoneOnder = "C";
              cpeOnder = cpeW.C;
            }
          } else {
            const loef = richting2 === "links" && aanLinkerzijde || richting2 === "rechts" && !aanLinkerzijde;
            zoneOnder = loef ? "D" : "E";
            cpeOnder = loef ? cpeW.D : cpeW.E;
          }
          push(
            `overstek ${zoneBoven} boven / ${zoneOnder} onder`,
            cpeBoven - cpeOnder,
            `NEN-EN 1991-1-4 \xA77.2.6 (onderzijde = wanddruk) met ${bronBoven}`,
            n.nx,
            n.nz,
            0
          );
          continue;
        }
      }
      perGeval.push({ sleutel, naam, regels });
    }
  }
  if (zoneIGebruikt) meldingen.push({ niveau: "waarschuwing", tekst: MELDING_ZONE_I });
  if (kleinOppervlak) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `Minstens \xE9\xE9n belast vlak is kleiner dan ${CPE10_MIN_OPPERVLAK_M2} m\xB2 (belastingbreedte \xD7 staaflengte). ${CPE10_BRON} schrijft dan c_pe,1 of een logaritmische overgang voor; de generator gebruikt overal c_pe,10 en kan voor die kleine vlakken dus te laag zitten.`
    });
  }
  if (lasten.length === 0) {
    return fout(
      "Er is geen enkele staaf met een belastingtype dat wind draagt (gevel, dak of overstek). Stel de belastingtypen in bij de staafeigenschappen."
    );
  }
  const combinaties = [];
  if (inst.combinatiesGenereren) {
    const eigen = model.loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const klasse = model.gevolgklasse ?? STANDAARD_GEVOLGKLASSE;
    const f = PARTIELE_FACTOREN[klasse];
    const overig = eigen.filter((c) => c.type === "other");
    if (overig.length > 0) {
      meldingen.push({
        niveau: "waarschuwing",
        tekst: `De belastinggevallen ${overig.map((c) => `\u201C${c.name}\u201D`).join(", ")} hebben type \u201Coverig\u201D. De generator kent daar geen \u03C8\u2080 bij en laat ze uit de gegenereerde combinaties. Geef ze een type, of neem ze handmatig op.`
      });
    }
    combinaties.push(...genereerWindCombinaties(model.loadCases, gevallen, klasse));
    meldingen.push({
      niveau: "info",
      tekst: `De gegenereerde combinaties gebruiken gevolgklasse ${klasse}: \u03B3 uit NEN-EN 1990 ${f.bron}, \u03C8 uit tabel NB.2\u2013A1.1. De betrouwbaarheidsfactor K_FI zit daarmee in de parti\xEBle factoren zelf en wordt nergens nog eens toegepast.`
    });
  }
  return {
    ok: true,
    meldingen,
    gevallen,
    lasten,
    combinaties,
    samenvatting: {
      hoogte_m: h_m,
      spanwijdte_m: d_m,
      hOverD: h_m / d_m,
      belastingbreedte_m: breedte_m,
      stuwdruk,
      perGeval
    },
    geometrie
  };
}
function genereerWindCombinaties(loadCases, windGevallen, gevolgklasse = STANDAARD_GEVOLGKLASSE) {
  const combinaties = [];
  {
    const eigen = loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const f = PARTIELE_FACTOREN[gevolgklasse];
    const G2 = eigen.filter((c) => c.type === "dead").map((c) => c.id);
    const r = (x) => Math.round(x * 1e9) / 1e9;
    const bron = `\u03B3: NEN-EN 1990 ${f.bron}; ${PSI_BRON}`;
    for (const gv of windGevallen) {
      const sets = [
        {
          naam: `UGT 6.10b \u2014 ${gv.naam} leidend`,
          type: "uls",
          formule: `${nl6(f.gGsup610b, 2)}\xB7G + ${nl6(f.gQ, 2)}\xB7W + ${nl6(f.gQ, 2)}\xB7\u03C8\u2080,Q\xB7Q + ${nl6(f.gQ, 2)}\xB7\u03C8\u2080,S\xB7S`,
          g: f.gGsup610b,
          wind: f.gQ,
          begeleidend: (psi) => r(f.gQ * psi.psi0)
        },
        {
          // STR/GEO met gunstig werkende blijvende belasting: de kolom
          // "Gunstig 0,9 G_k,j,inf" van NB.4/NB.5. Dit is GEEN EQU (NB.3
          // hanteert daar 1,1/0,9 voor het statisch evenwicht); tot september
          // 2026 heette deze combinatie ten onrechte zo. Tot dezelfde maand
          // stond er geen begeleidende last in; de opstelling zonder
          // begeleidende gevallen is precies die oude combinatie.
          naam: `UGT 6.10b \u2014 ${gv.naam} leidend, blijvend gunstig`,
          type: "uls",
          formule: `${nl6(f.gGinf, 2)}\xB7G + ${nl6(f.gQ, 2)}\xB7W + ${nl6(f.gQ, 2)}\xB7\u03C8\u2080,Q\xB7Q + ${nl6(f.gQ, 2)}\xB7\u03C8\u2080,S\xB7S`,
          g: f.gGinf,
          wind: f.gQ,
          begeleidend: (psi) => r(f.gQ * psi.psi0)
        },
        {
          naam: `BGT karakteristiek 6.14b \u2014 ${gv.naam} leidend`,
          type: "sls",
          formule: "G + W + \u03C8\u2080,Q\xB7Q + \u03C8\u2080,S\xB7S",
          g: 1,
          wind: 1,
          begeleidend: (psi) => psi.psi0
        },
        {
          // 6.15b met wind leidend (ψ₁,W = 0,2): de scheurwijdte van beton
          // leest de frequente combinatie, en zonder deze regel zou een
          // gegenereerde windlast daar nooit in voorkomen.
          naam: `BGT frequent 6.15b \u2014 ${gv.naam} leidend`,
          type: "sls",
          formule: "G + \u03C8\u2081,W\xB7W + \u03C8\u2082,Q\xB7Q + \u03C8\u2082,S\xB7S",
          g: 1,
          wind: PSI_WIND.psi1,
          begeleidend: (psi) => psi.psi2
        }
      ];
      for (const s of sets) {
        for (const o of begeleidendeOpstellingen(eigen, "W", s.begeleidend)) {
          const zonder = o.zonder.map((d) => d.naam).join(", ");
          combinaties.push({
            naam: WIND_COMBI_PREFIX + s.naam + (zonder ? `, zonder ${zonder}` : ""),
            type: s.type,
            formule: `${s.formule}${zonder ? ` (zonder ${zonder})` : ""}   [${bron}]`,
            factorenPerCaseId: [
              ...G2.map((id) => [id, s.g]),
              ...o.factoren
            ],
            windSleutel: gv.sleutel,
            windFactor: s.wind
          });
        }
      }
    }
  }
  return combinaties;
}
function handtekeningVanGeneratie(gevallen, lasten, combinaties) {
  const r = (v) => Number(v.toPrecision(12)).toString();
  const g = gevallen.map((c2) => `${c2.sleutel}|${c2.naam}`).join(";");
  const l = lasten.map((x) => `${x.gevalSleutel}|${x.beamId}|${r(x.q)}|${x.startFrac !== void 0 ? r(x.startFrac) : "-"}|${x.endFrac !== void 0 ? r(x.endFrac) : "-"}`).join(";");
  const c = combinaties.map((x) => `${x.naam}|${x.type}|${x.windSleutel}|${r(x.windFactor)}|${[...x.factorenPerCaseId].sort((p, q) => p[0] - q[0]).map(([id, f]) => `${id}:${r(f)}`).join(",")}`).join(";");
  return `G[${g}]L[${l}]C[${c}]`;
}
function handtekeningVanModel(loadCases, loads, combinaties) {
  const gevallen = loadCases.filter((c) => c.gegenereerd?.bron === "wind").map((c) => ({ id: c.id, sleutel: c.gegenereerd.sleutel, naam: c.name }));
  const sleutelVanId = new Map(gevallen.map((c) => [c.id, c.sleutel]));
  const gegenereerdeIds = new Set(gevallen.map((c) => c.id));
  const gLasten = loads.filter((l) => l.gegenereerdDoor === "wind").map((l) => ({
    gevalSleutel: sleutelVanId.get(l.caseId) ?? `?${l.caseId}`,
    beamId: l.beamId ?? -1,
    q: l.q ?? 0,
    startFrac: l.startFrac,
    endFrac: l.endFrac,
    toelichting: ""
  }));
  const gCombi = combinaties.filter((c) => c.name.startsWith(WIND_COMBI_PREFIX)).map((c) => {
    const windEntry = [...c.factors.entries()].find(([id]) => gegenereerdeIds.has(id));
    return {
      naam: c.name,
      type: c.type,
      windSleutel: windEntry ? sleutelVanId.get(windEntry[0]) ?? "?" : "",
      windFactor: windEntry ? windEntry[1] : 0,
      factorenPerCaseId: [...c.factors.entries()].filter(([id]) => !gegenereerdeIds.has(id))
    };
  });
  return handtekeningVanGeneratie(gevallen.map((c) => ({ sleutel: c.sleutel, naam: c.naam })), gLasten, gCombi);
}

// src/lib/combinatieBeheer.ts
function volgendVrijId(bestaande, teller) {
  const hoogste = bestaande.reduce((m, x) => Math.max(m, x.id), 0);
  return Math.max(teller, hoogste + 1);
}
function isWindgeneratorCombinatie(c) {
  return c.name.startsWith(WIND_COMBI_PREFIX);
}
function gelijkeFactoren(a, b) {
  if (a.size !== b.size) return false;
  for (const [id, f] of a) if (b.get(id) !== f) return false;
  return true;
}
function gelijkeInhoud(a, b) {
  return a.name === b.name && a.type === b.type && a.formula === b.formula && gelijkeFactoren(a.factors, b.factors);
}
function gelijkeCombinatie(a, b) {
  return gelijkeInhoud(a, b) && a.standaard?.sleutel === b.standaard?.sleutel && a.standaard?.soort === b.standaard?.soort && a.standaard?.gevolgklasse === b.standaard?.gevolgklasse;
}
function gelijkeLijst(a, b) {
  return a.length === b.length && a.every((c, i) => c.id === b[i].id && gelijkeCombinatie(c, b[i]));
}
function zonderOnbekendeGevallen(c, ids) {
  if ([...c.factors.keys()].every((id) => ids.has(id))) return c;
  return { ...c, factors: new Map([...c.factors].filter(([id]) => ids.has(id))) };
}
function perSleutel(set) {
  return new Map(set.map((c) => [c.standaard.sleutel, c]));
}
function nl7(x) {
  return String(Number(x.toFixed(3))).replace(".", ",");
}
function gelijk(a, b) {
  return Math.abs(a - b) <= 1e-9;
}
function namenLijst(lijst, max = 8) {
  return lijst.slice(0, max).map((x) => `"${x.naam}"`).join(", ") + (lijst.length > max ? ` en nog ${lijst.length - max}` : "");
}
function verwijderWeesFactoren(combinations, loadCases) {
  const ids = new Set(loadCases.map((c) => c.id));
  const wees = [];
  const combinaties = combinations.map((c) => {
    const onbekend = [...c.factors.keys()].filter((id) => !ids.has(id)).sort((a, b) => a - b);
    if (onbekend.length === 0) return c;
    wees.push({ combinatieId: c.id, naam: c.name, caseIds: onbekend });
    return zonderOnbekendeGevallen(c, ids);
  });
  return { combinaties, wees };
}
var OUDE_STANDAARDSET = [
  { naam: "ULS 6.10a", type: "uls", factoren: { 1: 1.35, 2: 1.05, 3: 1.05, 4: 0.9 } },
  { naam: "ULS 6.10b (Q leidend)", type: "uls", factoren: { 1: 1.2, 2: 1.5, 3: 1.05, 4: 0.9 } },
  { naam: "ULS 6.10b (S leidend)", type: "uls", factoren: { 1: 1.2, 3: 1.5, 2: 1.05, 4: 0.9 } },
  { naam: "ULS 6.10b (W leidend)", type: "uls", factoren: { 1: 1.2, 4: 1.5, 2: 1.05, 3: 1.05 } },
  { naam: "ULS uplift", type: "uls", factoren: { 1: 0.9, 4: 1.5 } },
  { naam: "SLS Karakteristiek", type: "sls", factoren: { 1: 1, 2: 1, 3: 0.7, 4: 0.6 } },
  { naam: "SLS Frequent", type: "sls", factoren: { 1: 1, 2: 0.5, 3: 0.2 } },
  { naam: "SLS Quasi-permanent", type: "sls", factoren: { 1: 1, 2: 0.3 } }
];
var OUDE_GEVALLEN = {
  2: "het veranderlijke geval (Q)",
  3: "het sneeuwgeval (S)",
  4: "het windgeval (W)"
};
function isOudeStandaardcombinatie(c, gevalIds) {
  if (c.standaard !== void 0 || isWindgeneratorCombinatie(c)) return false;
  const oud = OUDE_STANDAARDSET.find((o) => o.naam === c.name);
  if (!oud || oud.type !== c.type) return false;
  for (const [id, f] of c.factors) {
    if (!gevalIds.has(id)) continue;
    if (!gelijk(f, oud.factoren[id] ?? 0)) return false;
  }
  for (const [sleutel, f] of Object.entries(oud.factoren)) {
    const id = Number(sleutel);
    if (!gevalIds.has(id)) continue;
    if (!gelijk(c.factors.get(id) ?? 0, f)) return false;
  }
  return true;
}
function tekstOudeSetInProject(oud, klasse) {
  return `Dit project rekent met ${oud.length} ongewijzigde combinatie(s) van de standaardset van versie 0.3.11 en ouder: ${namenLijst(oud.map((c) => ({ naam: c.name })))}. Die set gaat uit van vaste belastinggevallen 1 t/m 4, vaste CC2-factoren en de door EN 1990 aanbevolen \u03C8-waarden (tabel A1.1) in plaats van die van de Nederlandse bijlage, en volgt de belastinggevallen en gevolgklasse ${klasse} van dit project niet. Bij het openen vervangt de app zo'n set; hij staat er weer na "Ongedaan maken", of doordat hij zo is meegestuurd.`;
}
function klasseUitKenmerk(combinations) {
  const klassen = new Set(
    (combinations ?? []).flatMap((c) => c.standaard ? [c.standaard.gevolgklasse] : [])
  );
  return klassen.size === 1 ? [...klassen][0] : null;
}
function gevolgklasseBijOpenen(p) {
  if (p.bestand) return { klasse: p.bestand, bron: "bestand" };
  if (p.verzoek) return { klasse: p.verzoek, bron: "verzoek" };
  const kenmerk = klasseUitKenmerk(p.combinations);
  if (kenmerk) return { klasse: kenmerk, bron: "kenmerk" };
  return { klasse: p.terugval, bron: "terugval" };
}
function windCombinatiesVoor(loadCases, gevolgklasse) {
  const wind = loadCases.filter((c) => c.gegenereerd?.bron === "wind");
  if (wind.length === 0) return null;
  const idVan = new Map(wind.map((c) => [c.gegenereerd.sleutel, c.id]));
  return genereerWindCombinaties(
    loadCases,
    wind.map((c) => ({ sleutel: c.gegenereerd.sleutel, naam: c.name })),
    gevolgklasse
  ).map((g) => ({
    name: g.naam,
    type: g.type,
    formula: g.formule,
    factors: new Map([...g.factorenPerCaseId, [idVan.get(g.windSleutel), g.windFactor]])
  }));
}
function synchroniseerWindCombinaties(staat) {
  const huidig = staat.combinations.filter(isWindgeneratorCombinatie);
  if (huidig.length === 0) return staat;
  const verwacht = windCombinatiesVoor(staat.loadCases, staat.gevolgklasse);
  if (verwacht === null) return staat;
  if (huidig.length === verwacht.length && huidig.every((c, i) => gelijkeInhoud(c, verwacht[i]))) {
    return staat;
  }
  const idPerNaam = /* @__PURE__ */ new Map();
  for (const c of huidig) if (!idPerNaam.has(c.name)) idPerNaam.set(c.name, c.id);
  let volgendId = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  const gebruikt = /* @__PURE__ */ new Set();
  const nieuw = verwacht.map((c) => {
    const id = idPerNaam.get(c.name);
    if (id !== void 0 && !gebruikt.has(id)) {
      gebruikt.add(id);
      return { ...c, id };
    }
    return { ...c, id: volgendId++ };
  });
  return {
    ...staat,
    combinations: [...staat.combinations.filter((c) => !isWindgeneratorCombinatie(c)), ...nieuw],
    volgendCombinatieId: volgendId
  };
}
function tekstVervanging(v) {
  const bron = PARTIELE_FACTOREN[v.gevolgklasse].bron;
  const delen = [];
  if (v.oudeStandaard.length > 0) {
    delen.push(
      `Bij het openen zijn ${v.oudeStandaard.length} belastingcombinatie(s) van de standaardset van versie 0.3.11 en ouder vervangen: ${namenLijst(v.oudeStandaard)}. Die set rekende met vaste belastinggevallen 1 t/m 4, vaste CC2-factoren en de door EN 1990 aanbevolen \u03C8-waarden (tabel A1.1) in plaats van die van de Nederlandse bijlage, en volgde de belastinggevallen van het project niet: een geval dat erbij kwam of van type veranderde, telde met verkeerde of geen factoren.`
    );
  }
  if (v.bijgewerkt.length > 0) {
    delen.push(
      `${v.bijgewerkt.length} standaardcombinatie(s) uit het bestand hoorden bij een andere gevolgklasse of andere belastinggevallen en zijn bijgewerkt: ${namenLijst(v.bijgewerkt)}.`
    );
  }
  if (v.wind.length > 0) {
    delen.push(
      `De ${v.wind.length} combinatie(s) van de windgenerator zijn opnieuw afgeleid uit de gegenereerde windgevallen, de overige belastinggevallen en gevolgklasse ${v.gevolgklasse}.`
    );
  }
  delen.push(
    `Het project rekent nu met ${v.aantalStandaard} standaardcombinaties` + (v.aantalWind > 0 ? ` en ${v.aantalWind} van de windgenerator` : "") + `, afgeleid uit zijn belastinggevallen en gevolgklasse ${v.gevolgklasse}: \u03B3 uit NEN-EN 1990 ${bron}, \u03C8 uit tabel NB.2\u2013A1.1.`
  );
  if (v.eigen.length > 0) {
    delen.push(
      `${v.eigen.length} eigen combinatie(s) zijn blijven staan: ${namenLijst(v.eigen)}. De app past ze niet aan, maar controleert ze wel; zie de meldingen bij de belastinggevallen.`
    );
  }
  delen.push(
    "De uitkomsten kunnen daardoor afwijken van een berekening met de versie waarin het bestand is opgeslagen."
  );
  return delen.join(" ");
}
function vervangVerouderdeCombinaties(staat) {
  const gevalIds = new Set(staat.loadCases.map((c) => c.id));
  const oud = staat.combinations.filter((c) => isOudeStandaardcombinatie(c, gevalIds));
  const metKenmerk = staat.combinations.filter((c) => c.standaard !== void 0);
  let volgend;
  if (oud.length > 0) {
    const weg = new Set(oud);
    let volgendId = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
    const idPerSleutel = /* @__PURE__ */ new Map();
    for (const c of metKenmerk) {
      const s = c.standaard.sleutel;
      if (!idPerSleutel.has(s)) idPerSleutel.set(s, c.id);
    }
    const standaard = genereerStandaardCombinaties(staat.loadCases, staat.gevolgklasse).map((c) => ({ ...c, id: idPerSleutel.get(c.standaard.sleutel) ?? volgendId++ }));
    const rest = staat.combinations.filter((c) => !weg.has(c) && c.standaard === void 0);
    volgend = synchroniseerWindCombinaties({
      ...staat,
      combinations: [...standaard, ...rest],
      volgendCombinatieId: volgendId
    });
  } else if (metKenmerk.length > 0) {
    volgend = synchroniseerStandaard(staat, { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse });
  } else {
    volgend = synchroniseerWindCombinaties(staat);
  }
  const naStandaard = new Map(
    volgend.combinations.filter((c) => c.standaard !== void 0).map((c) => [c.id, c])
  );
  const bijgewerkt = metKenmerk.filter((c) => {
    const n = naStandaard.get(c.id);
    return !n || !gelijkeInhoud(c, n);
  });
  const windVoor = staat.combinations.filter(isWindgeneratorCombinatie);
  const windNa = volgend.combinations.filter(isWindgeneratorCombinatie);
  const windAnders = windVoor.length !== windNa.length || windVoor.some((c, i) => !gelijkeInhoud(c, windNa[i]));
  const lijst = (l) => l.map((c) => ({ id: c.id, naam: c.name }));
  if (oud.length === 0 && bijgewerkt.length === 0 && !windAnders) {
    return { staat: volgend, vervanging: null };
  }
  const kern = {
    gevolgklasse: staat.gevolgklasse,
    oudeStandaard: lijst(oud),
    bijgewerkt: lijst(bijgewerkt),
    wind: windAnders ? lijst(windVoor) : [],
    eigen: lijst(volgend.combinations.filter((c) => c.standaard === void 0 && !isWindgeneratorCombinatie(c))),
    aantalStandaard: naStandaard.size,
    aantalWind: windNa.length
  };
  return {
    staat: volgend,
    vervanging: { ...kern, voor: staat.combinations, samenvatting: tekstVervanging(kern) }
  };
}
function herstelCombinaties(staat, voor) {
  const ids = new Set(staat.loadCases.map((c) => c.id));
  const combinations = voor.map((c) => zonderOnbekendeGevallen(c, ids));
  return {
    ...staat,
    combinations,
    volgendCombinatieId: Math.max(staat.volgendCombinatieId, volgendVrijId(combinations, 1))
  };
}
function openCombinatieStaat(p) {
  const gevalTeller = volgendVrijId(p.loadCases, p.idTellers?.belastinggeval ?? 1);
  if (!p.combinations) {
    const combinations = defaultCombinations(p.loadCases, p.gevolgklasse);
    return {
      staat: {
        loadCases: p.loadCases,
        combinations,
        gevolgklasse: p.gevolgklasse,
        volgendGevalId: gevalTeller,
        volgendCombinatieId: volgendVrijId(combinations, p.idTellers?.combinatie ?? 1)
      },
      afwijking: null,
      vervanging: null
    };
  }
  const { combinaties, wees } = verwijderWeesFactoren(p.combinations, p.loadCases);
  const hoogsteFactorSleutel = p.combinations.flatMap((c) => [...c.factors.keys()]).filter((id) => Number.isFinite(id)).reduce((m, id) => Math.max(m, id), 0);
  const { staat, vervanging } = vervangVerouderdeCombinaties({
    loadCases: p.loadCases,
    combinations: combinaties,
    gevolgklasse: p.gevolgklasse,
    volgendGevalId: Math.max(gevalTeller, hoogsteFactorSleutel + 1),
    volgendCombinatieId: volgendVrijId(combinaties, p.idTellers?.combinatie ?? 1)
  });
  return {
    staat,
    vervanging,
    afwijking: beoordeelCombinatiesBijOpenen({
      combinations: staat.combinations,
      loadCases: p.loadCases,
      weesFactoren: wees
    })
  };
}
function synchroniseerStandaard(staat, vorig) {
  const vorigeSleutels = perSleutel(genereerStandaardCombinaties(vorig.loadCases, vorig.gevolgklasse));
  const nieuweSet = genereerStandaardCombinaties(staat.loadCases, staat.gevolgklasse);
  const nieuwPerSleutel = perSleutel(nieuweSet);
  const geldigeIds = new Set(staat.loadCases.map((c) => c.id));
  let volgendId = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  const aanwezig = /* @__PURE__ */ new Map();
  const eigen = [];
  for (const c of staat.combinations) {
    if (c.standaard) {
      const n = nieuwPerSleutel.get(c.standaard.sleutel);
      if (!n || aanwezig.has(c.standaard.sleutel)) continue;
      const bijgewerkt = { ...n, id: c.id };
      aanwezig.set(c.standaard.sleutel, gelijkeCombinatie(c, bijgewerkt) ? c : bijgewerkt);
    } else {
      eigen.push(zonderOnbekendeGevallen(c, geldigeIds));
    }
  }
  const volledigInSet = /* @__PURE__ */ new Set();
  const volledigInLijst = /* @__PURE__ */ new Set();
  for (const n of nieuweSet) {
    const s = n.standaard.sleutel;
    if (basisSleutel(s) !== s) continue;
    volledigInSet.add(s);
    if (aanwezig.has(s) || !vorigeSleutels.has(s)) volledigInLijst.add(s);
  }
  const standaard = [];
  for (const n of nieuweSet) {
    const s = n.standaard.sleutel;
    const bestaand = aanwezig.get(s);
    if (bestaand) {
      standaard.push(bestaand);
      continue;
    }
    if (vorigeSleutels.has(s)) continue;
    const basis = basisSleutel(s);
    if (basis !== s && volledigInSet.has(basis) && !volledigInLijst.has(basis)) continue;
    standaard.push({ ...n, id: volgendId++ });
  }
  const combinations = [...standaard, ...eigen];
  return synchroniseerWindCombinaties({
    ...staat,
    combinations: gelijkeLijst(combinations, staat.combinations) ? staat.combinations : combinations,
    volgendCombinatieId: volgendId
  });
}
function voegBelastinggevalToe(staat, naam, type = "other") {
  const id = volgendVrijId(staat.loadCases, staat.volgendGevalId);
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  const volgend = {
    ...staat,
    loadCases: [...staat.loadCases, { id, name: naam, type }],
    volgendGevalId: id + 1
  };
  return { staat: synchroniseerStandaard(volgend, vorig), id };
}
function wijzigBelastinggeval(staat, id, patch) {
  if (!staat.loadCases.some((c) => c.id === id)) return staat;
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  const volgend = {
    ...staat,
    loadCases: staat.loadCases.map((c) => c.id === id ? { ...c, ...patch, id } : c)
  };
  return synchroniseerStandaard(volgend, vorig);
}
function verwijderBelastinggeval(staat, id) {
  if (!staat.loadCases.some((c) => c.id === id)) return staat;
  if (staat.loadCases.length <= 1) return staat;
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  const volgend = {
    ...staat,
    loadCases: staat.loadCases.filter((c) => c.id !== id),
    // De teller mag nooit onder het verwijderde id uitkomen.
    volgendGevalId: Math.max(staat.volgendGevalId, id + 1)
  };
  return synchroniseerStandaard(volgend, vorig);
}
function zetGevolgklasse(staat, gevolgklasse) {
  if (gevolgklasse === staat.gevolgklasse) return staat;
  const vorig = { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse };
  return synchroniseerStandaard({ ...staat, gevolgklasse }, vorig);
}
function vervangDoorStandaard(staat) {
  const geldigeIds = new Set(staat.loadCases.map((c) => c.id));
  let volgendId = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  const standaard = genereerStandaardCombinaties(staat.loadCases, staat.gevolgklasse).map((c) => ({ ...c, id: volgendId++ }));
  const wind = staat.combinations.filter(isWindgeneratorCombinatie).map((c) => zonderOnbekendeGevallen(c, geldigeIds));
  return synchroniseerWindCombinaties({
    ...staat,
    combinations: [...standaard, ...wind],
    volgendCombinatieId: volgendId
  });
}
function voegCombinatieToe(staat, combo) {
  const id = volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  const { standaard: _weg, ...rest } = combo;
  return {
    ...staat,
    combinations: [...staat.combinations, { ...rest, id }],
    volgendCombinatieId: id + 1
  };
}
function wijzigCombinatie(staat, id, patch) {
  if (!staat.combinations.some((c) => c.id === id)) return staat;
  return {
    ...staat,
    combinations: staat.combinations.map((c) => {
      if (c.id !== id) return c;
      const { standaard: _weg, ...rest } = { ...c, ...patch };
      return { ...rest, id };
    })
  };
}
function verwijderCombinatie(staat, id) {
  if (!staat.combinations.some((c) => c.id === id)) return staat;
  return {
    ...staat,
    combinations: staat.combinations.filter((c) => c.id !== id),
    volgendCombinatieId: Math.max(staat.volgendCombinatieId, id + 1)
  };
}
var TYPE_TEKST = {
  dead: "blijvend",
  live: "veranderlijk",
  snow: "sneeuw",
  wind: "wind",
  other: "overig"
};
function isAfgeleidVanStandaard(c) {
  if (isWindgeneratorCombinatie(c)) return false;
  return c.standaard !== void 0 || c.formula.includes(PSI_BRON);
}
function ontbrekendeStandaardcombinaties(p) {
  const gevuld = p.gevuld ?? (() => true);
  const inhoud = (factors) => [...factors].filter(([id, f]) => f !== 0 && gevuld(id)).sort((a, b) => a[0] - b[0]).map(([id, f]) => `${id}:${Math.round(f * 1e9) / 1e9}`).join(",");
  const soortDeel = (type, soort) => type === "sls" ? soort ?? "?" : "";
  const aanwezig = new Set(
    p.combinations.map((c) => `${c.type}|${soortDeel(c.type, soortVanCombinatie(c))}|${inhoud(c.factors)}`)
  );
  return genereerStandaardCombinaties(p.loadCases, p.gevolgklasse).filter((n) => {
    const eigen = inhoud(n.factors);
    if (eigen === "") return false;
    return !aanwezig.has(`${n.type}|${soortDeel(n.type, n.standaard.soort)}|${eigen}`);
  });
}
function tekstOntbrekend(ontbrekend, klasse) {
  const MAX = 6;
  const namen = ontbrekend.slice(0, MAX).map((c) => `"${c.name}" (${c.formula.split("   [")[0]})`).join(", ") + (ontbrekend.length > MAX ? ` en nog ${ontbrekend.length - MAX}` : "");
  return `${ontbrekend.length} standaardcombinatie(s) ontbreken, dus de omhullende kan te laag zijn. Ze horen bij deze belastinggevallen en ${klasse}, en geen andere combinatie in dit project heeft dezelfde factoren voor de gevallen met last: ${namen}. Een combinatieset die een deel van de standaardset mist, geeft een lagere omhullende zonder dat een getal dat verraadt. Dat gebeurt als een standaardcombinatie is verwijderd, hernoemd of aangepast \u2014 dan is ze een eigen combinatie en volgt ze de belastinggevallen niet meer \u2014 en er daarna een belastinggeval bij kwam of van type of categorie veranderde. Kies "Vervang door standaardcombinaties" in Belastinggevallen & combinaties, of voeg de ontbrekende combinaties als eigen combinatie toe.`;
}
function veranderlijkeFactorVerschillen(p) {
  const gevuld = p.gevuld ?? (() => true);
  const groepen = /* @__PURE__ */ new Map();
  for (const c of p.loadCases) {
    if (c.type !== "live" || c.gegenereerd?.bron === "wind" || !gevuld(c.id)) continue;
    const cat = c.categorie ?? STANDAARD_CATEGORIE;
    groepen.set(cat, [...groepen.get(cat) ?? [], c.id]);
  }
  const uit = [];
  for (const [categorie, ids] of groepen) {
    if (ids.length < 2) continue;
    const combinaties = [];
    for (const c of p.combinations) {
      const factoren = ids.map((id) => [id, c.factors.get(id) ?? 0]).filter(([, f]) => f !== 0);
      if (new Set(factoren.map(([, f]) => Math.round(f * 1e9) / 1e9)).size > 1) {
        combinaties.push({ combinatieId: c.id, naam: c.name, factoren });
      }
    }
    if (combinaties.length > 0) uit.push({ categorie, caseIds: ids, combinaties });
  }
  return uit;
}
function tekstVerschil(v, naamVan) {
  const MAX = 6;
  const regels = v.combinaties.slice(0, MAX).map((c) => `"${c.naam}" ${c.factoren.map(([id, f]) => `${nl7(f)} voor geval ${id}`).join(" en ")}`).join("; ") + (v.combinaties.length > MAX ? `; en nog ${v.combinaties.length - MAX}` : "");
  return `De veranderlijke belastinggevallen ${v.caseIds.map(naamVan).join(", ")} (gebruikscategorie ${v.categorie}) hebben in ${v.combinaties.length} combinatie(s) verschillende factoren: ${regels}. Gevallen van dezelfde gebruikscategorie zijn delen van \xE9\xE9n veranderlijke belasting \u2014 zo stelt de app de standaardcombinaties op \u2014 en in \xE9\xE9n combinatie is die belasting de overheersende (\u03B3_Q) of een samengaande (\u03B3_Q\xB7\u03C8\u2080), NEN-EN 1990 6.4.3.2(2); elk aanwezig deel draagt dan dezelfde factor. Een combinatie waarin het ene deel overheerst en het andere samengaat, telt de belasting te laag, en de combinatie waarin alle delen samen overheersen ontbreekt dan mogelijk. Dit ontstaat als een geval van type of categorie verandert terwijl de combinaties eigen combinaties zijn (hernoemd of aangepast): die volgen de gevallen niet. Kies "Vervang door standaardcombinaties" in Belastinggevallen & combinaties, of pas de factoren van deze combinaties aan.`;
}
var GAMMA_Q_MIN = Math.min(...GEVOLGKLASSEN.map((k) => PARTIELE_FACTOREN[k].gQ));
function veranderlijkeBelastingenZonderLeiding(p) {
  const gevuld = p.gevuld ?? (() => true);
  const acties = [];
  const live = p.loadCases.filter((c) => c.type === "live" && gevuld(c.id));
  for (const cat of [...new Set(live.map((c) => c.categorie ?? STANDAARD_CATEGORIE))]) {
    const leden = live.filter((c) => (c.categorie ?? STANDAARD_CATEGORIE) === cat);
    acties.push({
      label: leden.length === 1 ? `"${leden[0].name}"` : `veranderlijk, categorie ${cat}`,
      caseIds: leden.map((c) => c.id)
    });
  }
  for (const c of p.loadCases) {
    if ((c.type === "snow" || c.type === "wind") && gevuld(c.id)) {
      acties.push({ label: `"${c.name}"`, caseIds: [c.id] });
    }
  }
  const ugt = p.combinations.filter((c) => c.type === "uls");
  const uit = [];
  for (const a of acties) {
    let hoogste = 0;
    let overheerst = false;
    for (const c of ugt) {
      const f = a.caseIds.map((id) => c.factors.get(id) ?? 0).filter((x) => x !== 0);
      if (f.length === 0) continue;
      hoogste = Math.max(hoogste, ...f.map(Math.abs));
      const eenFactor = new Set(f.map((x) => Math.round(x * 1e9) / 1e9)).size === 1;
      if (eenFactor && Math.abs(f[0]) >= GAMMA_Q_MIN - 1e-9) {
        overheerst = true;
        break;
      }
    }
    if (!overheerst && hoogste > 0) uit.push({ ...a, hoogste });
  }
  return uit;
}
function tekstZonderLeiding(a) {
  const \u03B3 = (k) => nl7(PARTIELE_FACTOREN[k].gQ);
  return `Veranderlijke belasting ${a.label} (belastinggeval ${a.caseIds.join(", ")}) is in geen enkele UGT-combinatie de overheersende veranderlijke belasting: ze komt alleen voor met een factor van ten hoogste ${nl7(a.hoogste)}. Elke combinatie omvat een overheersende veranderlijke belasting (NEN-EN 1990 6.4.3.1(2)) en de rekenwaarden volgen uit elk kritiek belastingsgeval (6.4.3.1(1)P); in uitdrukking 6.10b (NB A1.3.1(1)) krijgt de overheersende belasting \u03B3_Q zonder \u03C8\u2080: ${\u03B3("CC1")} in CC1 (NB tabel NB.5), ${\u03B3("CC2")} in CC2 (NB.4), ${\u03B3("CC3")} in CC3 (NB.5). Zonder zo'n combinatie kan de omhullende te laag zijn. Kies "Vervang door standaardcombinaties", of voeg een combinatie toe waarin deze belasting overheerst.`;
}
function gelijkeRekeninhoudSet(a, b) {
  if (a.length !== b.length) return false;
  const vrij = [...b];
  for (const c of a) {
    const i = vrij.findIndex((x) => x.type === c.type && x.factors.size === c.factors.size && [...c.factors].every(([id, f]) => gelijk(x.factors.get(id) ?? Number.NaN, f)));
    if (i < 0) return false;
    vrij.splice(i, 1);
  }
  return true;
}
function verouderdeWindCombinaties(p) {
  const huidig = p.combinations.filter(isWindgeneratorCombinatie);
  if (huidig.length === 0) return null;
  const verwacht = windCombinatiesVoor(p.loadCases, p.gevolgklasse);
  if (verwacht !== null && gelijkeRekeninhoudSet(huidig, verwacht)) return null;
  return { aantal: huidig.length, verwacht: verwacht?.length ?? null };
}
function tekstWindVerouderd(v, klasse) {
  return `${v.aantal} combinatie(s) van de windgenerator passen niet bij de belastinggevallen en gevolgklasse ${klasse} van dit project: ` + (v.verwacht === null ? "er staat geen gegenereerd windbelastinggeval meer in het model waar ze bij horen" : `de generator zou nu ${v.verwacht} combinatie(s) met andere factoren maken`) + ". De gegenereerde set is verouderd: een combinatie die de generator nu wel zou maken \u2014 met een later toegevoegd veranderlijk geval als samengaande belasting, of met de factoren van een andere gevolgklasse \u2014 ontbreekt in de omhullende. Open de windbelastinggenerator en genereer de windbelasting opnieuw.";
}
var UGT_FACTOREN_BLIJVEND = [
  .../* @__PURE__ */ new Set([
    ...GEVOLGKLASSEN.flatMap((k) => [
      PARTIELE_FACTOREN[k].gGsup610a,
      PARTIELE_FACTOREN[k].gGsup610b,
      PARTIELE_FACTOREN[k].gGinf
    ]),
    1
  ])
];
function oudeKolomVan(caseId, combinations) {
  if (OUDE_GEVALLEN[caseId] === void 0) return null;
  const oud = combinations.map((c) => ({ c, o: OUDE_STANDAARDSET.find((x) => x.naam === c.name) })).filter((x) => x.o !== void 0);
  if (oud.length < 3) return null;
  return oud.every(({ c, o }) => gelijk(c.factors.get(caseId) ?? 0, o.factoren[caseId] ?? 0)) ? caseId : null;
}
function blijvendeFactorAfwijkingen(p) {
  const blijvend = p.loadCases.filter((c) => c.type === "dead");
  const uit = [];
  for (const g of blijvend) {
    const regels = [];
    for (const c of p.combinations) {
      const f = c.factors.get(g.id) ?? 0;
      const ander = blijvend.find((o) => {
        const fo = c.factors.get(o.id) ?? 0;
        return o.id !== g.id && fo !== 0 && !gelijk(fo, f);
      });
      const pastNiet = f !== 0 && (c.type === "sls" ? !gelijk(f, 1) : !UGT_FACTOREN_BLIJVEND.some((x) => gelijk(x, f)));
      if (!pastNiet && !ander) continue;
      const waarom = [];
      if (pastNiet) {
        waarom.push(c.type === "sls" ? "in de BGT telt een blijvende belasting met 1,0" : "geen \u03B3_G uit NB tabel NB.4/NB.5 en geen 1,0");
      }
      if (ander) waarom.push(`blijvend geval ${ander.id} heeft daar ${nl7(c.factors.get(ander.id) ?? 0)}`);
      regels.push({
        combinatieId: c.id,
        combinatie: c.name,
        factor: f,
        pastNiet,
        tekst: `"${c.name}" ${f === 0 ? "geen factor" : nl7(f)} (${waarom.join("; ")})`
      });
    }
    if (regels.some((r) => r.pastNiet)) {
      uit.push({ caseId: g.id, naam: g.name, regels, oudeKolom: oudeKolomVan(g.id, p.combinations) });
    }
  }
  return uit;
}
function regelsEnHerkomst(a) {
  const MAX = 8;
  const lijst = a.regels.slice(0, MAX).map((r) => r.tekst).join("; ") + (a.regels.length > MAX ? `; en nog ${a.regels.length - MAX}` : "");
  const herkomst = a.oudeKolom !== null ? `Het zijn precies de factoren die de standaardcombinaties van v\xF3\xF3r september 2026 aan belastinggeval ${a.oudeKolom} gaven, ${OUDE_GEVALLEN[a.oudeKolom]}. Zo'n geval heeft het id van een verwijderd geval gekregen (tot september 2026 erfde het dan diens factoren), of zijn type is later gewijzigd zonder dat de factoren meegingen.` : "Zo'n patroon ontstaat in een projectbestand van v\xF3\xF3r september 2026 wanneer een verwijderd geval zijn id aan een nieuw geval doorgaf, of wanneer het type later is gewijzigd zonder dat de factoren meegingen.";
  return { lijst, herkomst };
}
function tekstBlijvendeAfwijking(a) {
  const { lijst, herkomst } = regelsEnHerkomst(a);
  return `Belastinggeval ${a.caseId} ("${a.naam}") is van type blijvend, maar draagt factoren die niet bij een blijvende belasting passen: ${lijst}. Alle blijvende gevallen samen zijn \xE9\xE9n blijvende belasting G, met in elke combinatie dezelfde factor: \u03B3_G uit NEN-EN 1990 NB tabel NB.4/NB.5 in de UGT (0,9 waar zij gunstig werkt), 1,0 in de BGT (6.14b\u20136.16b). ${herkomst} De last van dit geval telt daardoor met de verkeerde factoren. Kies "Vervang door standaardcombinaties" in Belastinggevallen & combinaties, of corrigeer de factoren van dit geval.`;
}
function meldingenBelastinggevallen(p) {
  const meldingen = [];
  const blijvend = p.loadCases.find((c) => c.type === "dead");
  const gevuld = (id) => p.loads === void 0 || p.loads.some((l) => l.caseId === id) || p.selfWeightEnabled === true && blijvend?.id === id;
  const heeftFactor = (id, type) => p.combinations.some((c) => c.type === type && (c.factors.get(id) ?? 0) !== 0);
  const heeftBgt = p.combinations.some((c) => c.type === "sls");
  const naamVan = (id) => {
    const c = p.loadCases.find((x) => x.id === id);
    return c ? `${id} ("${c.name}")` : String(id);
  };
  if (p.selfWeightEnabled && !blijvend) {
    meldingen.push({
      niveau: "fout",
      caseId: null,
      tekst: 'Eigen gewicht staat aan, maar er is geen belastinggeval van type "blijvend". Het eigen gewicht wordt daarom NIET meegerekend. Tot september 2026 kwam het stil in het eerste belastinggeval terecht, met de factoren van d\xE1t type \u2014 bij een veranderlijk geval \u03C8\u2082 = 0,3 in de quasi-blijvende combinatie in plaats van 1,0. Maak een belastinggeval van type "blijvend" aan.'
    });
  }
  const alle = p.alleCombinaties ?? p.combinations;
  const eenStandaard = alle.find((c) => c.standaard);
  const klasse = p.gevolgklasse ?? eenStandaard?.standaard?.gevolgklasse ?? STANDAARD_GEVOLGKLASSE;
  const gevalIds = new Set(p.loadCases.map((c) => c.id));
  const oud = alle.filter((c) => isOudeStandaardcombinatie(c, gevalIds));
  if (oud.length > 0 || alle.some(isAfgeleidVanStandaard)) {
    const ontbrekend = ontbrekendeStandaardcombinaties({
      combinations: alle,
      loadCases: p.loadCases,
      gevolgklasse: klasse,
      gevuld
    });
    if (ontbrekend.length > 0) {
      meldingen.push({
        niveau: "fout",
        caseId: null,
        vervangAdvies: true,
        tekst: (oud.length > 0 ? `${tekstOudeSetInProject(oud, klasse)} ` : "") + tekstOntbrekend(ontbrekend, klasse)
      });
    }
  }
  for (const v of veranderlijkeFactorVerschillen({ loadCases: p.loadCases, combinations: p.combinations, gevuld })) {
    meldingen.push({ niveau: "fout", caseId: null, vervangAdvies: true, tekst: tekstVerschil(v, naamVan) });
  }
  for (const a of veranderlijkeBelastingenZonderLeiding({
    loadCases: p.loadCases,
    combinations: p.combinations,
    gevuld
  })) {
    meldingen.push({ niveau: "fout", caseId: null, vervangAdvies: true, tekst: tekstZonderLeiding(a) });
  }
  if (p.metHout) {
    const zonder = ontbrekendeBlijvendeCombinatie({
      combinaties: p.combinations,
      loadCases: p.loadCases,
      gevuld
    });
    if (zonder) {
      meldingen.push({
        niveau: "fout",
        caseId: null,
        vervangAdvies: true,
        tekst: `Er staan houten staven in het model en ${zonder.map((c) => naamVan(c.id)).join(", ")} ${zonder.length === 1 ? "is een blijvend belastinggeval" : "zijn blijvende belastinggevallen"}, maar geen enkele UGT-combinatie bevat alleen blijvende belasting (zoals 6.10a zonder veranderlijke belasting, 1,35\xB7G). EN 1995-1-1 3.1.3(2): k_mod hoort bij de kortste belastingsduur in een combinatie. Zonder zo'n combinatie wordt de houttoets nooit met k_mod "blijvend" (0,60 in klimaatklasse 1 en 2) uitgevoerd, terwijl juist die bij een kleine veranderlijke belasting maatgevend is \u2014 de toetsing kan dan te gunstig uitvallen. Voeg de combinatie toe, of gebruik de standaardcombinaties.`
      });
    }
  }
  const nietHerkendeBgt = p.combinations.filter((c) => c.type === "sls" && soortVanCombinatie(c) === null);
  if (nietHerkendeBgt.length > 0) {
    meldingen.push({
      niveau: "waarschuwing",
      caseId: null,
      tekst: `BGT-combinatie ${nietHerkendeBgt.map((c) => `${c.id} ("${c.name}")`).join(", ")} ${nietHerkendeBgt.length === 1 ? "is" : "zijn"} niet herkend als karakteristiek (6.14b), frequent (6.15b) of quasi-blijvend (6.16b): het kenmerk ontbreekt en de naam bevat geen "karakter", "frequent" of "quasi". De doorbuigingstoets van staal en hout weegt ${nietHerkendeBgt.length === 1 ? "haar" : "ze"} veilig-zijdig mee in de omhullende; de betontoetsing gebruikt ${nietHerkendeBgt.length === 1 ? "haar" : "ze"} NIET (de scheurwijdte van \xA77.3 vraagt 6.15b, de kruip van \xA75.8.4 vraagt 6.16b). Is de combinatie een van de drie, geef haar dan een herkenbare naam.`
    });
  }
  if (p.gevolgklasse !== void 0) {
    const wind = verouderdeWindCombinaties({ loadCases: p.loadCases, combinations: alle, gevolgklasse: p.gevolgklasse });
    if (wind) {
      meldingen.push({
        niveau: "fout",
        caseId: null,
        windOpnieuwAdvies: true,
        tekst: tekstWindVerouderd(wind, p.gevolgklasse)
      });
    }
  }
  const blijvendAfwijkend = new Map(
    blijvendeFactorAfwijkingen({ loadCases: p.loadCases, combinations: p.combinations }).map((a) => [a.caseId, a])
  );
  if (p.combinations.some((c) => c.standaard)) {
    const eigen = p.loadCases.filter((c) => c.gegenereerd?.bron !== "wind");
    const aantal = aantalGebruiksgevallen(eigen);
    if (aantal > MAX_VRIJE_GEVALLEN) {
      meldingen.push({
        niveau: "waarschuwing",
        caseId: null,
        tekst: `Er zijn ${aantal} veranderlijke belastinggevallen (gebruiksbelasting). De standaardcombinaties zetten er hoogstens ${MAX_VRIJE_GEVALLEN} afzonderlijk aan en uit; bij meer gaan de gevallen van \xE9\xE9n gebruikscategorie samen aan of uit. Een gebruiksbelasting is een vrije belasting die op het meest ongunstige deel moet staan (NEN-EN 1991-1-1 6.2.1(1)P): een per veld verdeelde vloerlast op alleen het ongunstigste veld zit nu NIET in de set, en de omhullende kan daardoor te laag zijn. Voeg die opstellingen toe als eigen combinaties, of beperk het aantal veranderlijke gevallen.`
      });
    }
    const soorten = [
      { type: "wind", meervoud: "windgevallen", voorbeeld: "druk op de gevel en zuiging op het dak bij \xE9\xE9n windrichting" },
      { type: "snow", meervoud: "sneeuwgevallen", voorbeeld: "de sneeuw op twee dakvlakken bij \xE9\xE9n sneeuwverdeling" }
    ];
    for (const s of soorten) {
      const alternatieven = eigen.filter((c) => c.type === s.type);
      if (alternatieven.length < 2) continue;
      meldingen.push({
        niveau: "waarschuwing",
        caseId: null,
        tekst: `De ${s.meervoud} ${alternatieven.map((c) => `${c.id} ("${c.name}")`).join(", ")} gelden in de standaardcombinaties als ALTERNATIEVEN: elk leidt apart, en ze staan nooit samen in \xE9\xE9n combinatie (zoals wind van links \xF3f van rechts). Horen ze bij dezelfde belasting \u2014 bijvoorbeeld ${s.voorbeeld} \u2014 zet ze dan in \xE9\xE9n belastinggeval; anders telt steeds maar een deel ervan mee.`
      });
    }
  }
  for (const c of p.loadCases) {
    const naam = `Belastinggeval ${c.id} ("${c.name}")`;
    const metLast = gevuld(c.id);
    if (!heeftFactor(c.id, "uls")) {
      const typeloos = c.type === void 0 || c.type === "other";
      const oorzaak = typeloos ? `heeft ${c.type === void 0 ? "geen type" : 'type "overig"'} en telt daardoor in geen enkele UGT-combinatie mee. Voor zo'n geval bestaat geen normfactor (NEN-EN 1990 NB tabel NB.4 en NB.2\u2013A1.1 kennen alleen blijvende en veranderlijke belastingen): kies het type \u2014 blijvend, veranderlijk, sneeuw of wind \u2014 zodat de standaardcombinaties het opnemen, of geef het in een eigen combinatie zelf een factor.` : `(type ${TYPE_TEKST[c.type] ?? c.type}) telt in geen enkele UGT-combinatie mee: in elke doorgerekende combinatie is zijn factor 0. De combinaties van dit project zijn geen (volledige) standaardset; controleer ze, of vervang ze door de standaardcombinaties.`;
      meldingen.push({
        niveau: metLast ? "fout" : "waarschuwing",
        caseId: c.id,
        tekst: `${naam} ${oorzaak}` + (metLast ? " Zolang dat zo is, telt de last van dit geval in elke toets als NUL." : " Het geval is nog leeg; een last die u erin zet, telt pas mee als dit is opgelost."),
        ...typeloos ? {} : { vervangAdvies: true }
      });
      continue;
    }
    const afwijking = blijvendAfwijkend.get(c.id);
    if (afwijking) {
      meldingen.push({
        niveau: metLast ? "fout" : "waarschuwing",
        caseId: c.id,
        vervangAdvies: true,
        tekst: tekstBlijvendeAfwijking(afwijking)
      });
    }
    if (metLast && heeftBgt && !heeftFactor(c.id, "sls")) {
      meldingen.push({
        niveau: "waarschuwing",
        caseId: c.id,
        tekst: `${naam} telt wel in de UGT maar in geen enkele BGT-combinatie mee: doorbuiging, horizontale verplaatsing en scheurwijdte zien de last van dit geval niet.`
      });
    }
  }
  return meldingen;
}
function beoordeelCombinatiesBijOpenen(p) {
  const weesFactoren = [...p.weesFactoren ?? []];
  const blijvend = blijvendeFactorAfwijkingen({ loadCases: p.loadCases, combinations: p.combinations });
  if (weesFactoren.length === 0 && blijvend.length === 0) return null;
  const weesIds = [...new Set(weesFactoren.flatMap((w) => w.caseIds))].sort((a, b) => a - b);
  const samenvatting = blijvend.map((a) => {
    const { lijst, herkomst } = regelsEnHerkomst(a);
    return `LET OP: belastinggeval ${a.caseId} ("${a.naam}") is van type blijvend, maar draagt factoren die niet bij een blijvende belasting passen: ${lijst}. Een blijvende belasting telt in de BGT met 1,0 en heeft in elke combinatie dezelfde factor als de andere blijvende gevallen. ${herkomst} Zolang dat zo is, telt de last van dit geval met de verkeerde factoren. Het zijn eigen combinaties, dus de app past ze niet aan: kies "Vervang door standaardcombinaties" in Belastinggevallen & combinaties, of corrigeer de factoren. `;
  }).join("") + (weesFactoren.length > 0 ? `In ${weesFactoren.length} belastingcombinatie(s) (${weesFactoren.map((w) => `"${w.naam}"`).join(", ")}) stonden factoren voor ` + (weesIds.length === 1 ? `belastinggeval ${weesIds[0]}, dat in dit project niet (meer) bestaat` : `belastinggevallen ${weesIds.join(", ")}, die in dit project niet (meer) bestaan`) + `: een rest van een verwijderd geval. Die factoren zijn bij het openen weggehaald. Ze vermenigvuldigden geen enkele last, dus geen uitkomst van dit project verandert; een nieuw belastinggeval krijgt een id boven ${weesIds[weesIds.length - 1]} en kan ze niet meer erven.` : "");
  return { weesFactoren, blijvend, samenvatting: samenvatting.trim() };
}

// src/lib/steelSectionDims.generated.ts
var STEEL_SECTION_DIMS = {
  "UNP350": {
    kind: "Channel",
    naam: "UNP350",
    h: 350,
    b: 100,
    tw: 14,
    tf: 16,
    r: 16,
    flensHelling: 0.08,
    props: { iz: 5603739, welY: 725384, welZ: 73447, wplY: 889763, wplZ: 139730, avZ: 4946, it: 603930, iw: 105718e6, iRadY: 128.7, iRadZ: 27 }
  },
  "HFRHS200X200X16": {
    kind: "Shs",
    naam: "HFRHS200X200X16",
    h: 200,
    b: 200,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 63935400, welY: 639354, welZ: 639354, wplY: 785472, wplZ: 785472, avZ: 5750.65, it: 10244e4, iw: 0, iRadY: 74.5585, iRadZ: 74.5585 }
  },
  "IPE80": {
    kind: "ISection",
    naam: "IPE 80",
    h: 80,
    b: 46,
    tw: 3.8,
    tf: 5.2,
    r: 5,
    props: { iz: 84900, welY: 2e4, welZ: 3690, wplY: 23200, wplZ: 5820, avZ: 357.4, it: 7e3, iw: 115111e3, iRadY: 32.37945829336445, iRadZ: 10.541615362469917 }
  },
  "IPE100": {
    kind: "ISection",
    naam: "IPE 100",
    h: 100,
    b: 55,
    tw: 4.1,
    tf: 5.7,
    r: 7,
    props: { iz: 159e3, welY: 34200, welZ: 5790, wplY: 39400, wplZ: 9150, avZ: 506.2, it: 12e3, iw: 342049e3, iRadY: 40.745480421235456, iRadZ: 12.424529449393042 }
  },
  "IPE120": {
    kind: "ISection",
    naam: "IPE 120",
    h: 120,
    b: 64,
    tw: 4.4,
    tf: 6.3,
    r: 7,
    props: { iz: 277e3, welY: 53e3, welZ: 8650, wplY: 60700, wplZ: 13600, avZ: 629.5, it: 17400, iw: 87183e4, iRadY: 49.08249086070214, iRadZ: 14.486148033500308 }
  },
  "IPE140": {
    kind: "ISection",
    naam: "IPE 140",
    h: 140,
    b: 73,
    tw: 4.7,
    tf: 6.9,
    r: 7,
    props: { iz: 449e3, welY: 77300, welZ: 12300, wplY: 88300, wplZ: 19300, avZ: 761.6, it: 24500, iw: 195034e4, iRadY: 57.43501099333819, iRadZ: 16.5463134203628 }
  },
  "IPE160": {
    kind: "ISection",
    naam: "IPE 160",
    h: 160,
    b: 82,
    tw: 5,
    tf: 7.4,
    r: 9,
    props: { iz: 683e3, welY: 109e3, welZ: 16700, wplY: 124e3, wplZ: 26100, avZ: 966.6, it: 36e3, iw: 388826e4, iRadY: 65.75243786033423, iRadZ: 18.43369184468688 }
  },
  "IPE180": {
    kind: "ISection",
    naam: "IPE 180",
    h: 180,
    b: 91,
    tw: 5.3,
    tf: 8,
    r: 9,
    props: { iz: 101e4, welY: 146e3, welZ: 22200, wplY: 166e3, wplZ: 34600, avZ: 1120.4, it: 47900, iw: 732103e4, iRadY: 74.31697351413912, iRadZ: 20.55709469403238 }
  },
  "IPE200": {
    kind: "ISection",
    naam: "IPE 200",
    h: 200,
    b: 100,
    tw: 5.6,
    tf: 8.5,
    r: 12,
    props: { iz: 142e4, welY: 194e3, welZ: 28500, wplY: 221e3, wplZ: 44600, avZ: 1401.6, it: 69800, iw: 127449e5, iRadY: 82.50465164982911, iRadZ: 22.321416040096732 }
  },
  "IPE220": {
    kind: "ISection",
    naam: "IPE 220",
    h: 220,
    b: 110,
    tw: 5.9,
    tf: 9.2,
    r: 12,
    props: { iz: 205e4, welY: 252e3, welZ: 37300, wplY: 285e3, wplZ: 58100, avZ: 1591.1, it: 90700, iw: 223082e5, iRadY: 91.06817871052816, iRadZ: 24.774431478639833 }
  },
  "IPE240": {
    kind: "ISection",
    naam: "IPE 240",
    h: 240,
    b: 120,
    tw: 6.2,
    tf: 9.8,
    r: 15,
    props: { iz: 284e4, welY: 324e3, welZ: 47300, wplY: 367e3, wplZ: 73900, avZ: 1912.8, it: 129e3, iw: 36677e6, iRadY: 99.74391763340427, iRadZ: 26.950746019311644 }
  },
  "IPE270": {
    kind: "ISection",
    naam: "IPE 270",
    h: 270,
    b: 135,
    tw: 6.6,
    tf: 10.2,
    r: 15,
    props: { iz: 42e5, welY: 429e3, welZ: 62200, wplY: 484e3, wplZ: 97e3, avZ: 2209.3, it: 159e3, iw: 694639e5, iRadY: 112.31375287544851, iRadZ: 30.249507099101006 }
  },
  "IPE300": {
    kind: "ISection",
    naam: "IPE 300",
    h: 300,
    b: 150,
    tw: 7.1,
    tf: 10.7,
    r: 15,
    props: { iz: 604e4, welY: 557e3, welZ: 80500, wplY: 628e3, wplZ: 125e3, avZ: 2567, it: 201e3, iw: 124247e6, iRadY: 124.65565954760767, iRadZ: 33.50636625964759 }
  },
  "IPE330": {
    kind: "ISection",
    naam: "IPE 330",
    h: 330,
    b: 160,
    tw: 7.5,
    tf: 11.5,
    r: 18,
    props: { iz: 788e4, welY: 713e3, welZ: 98500, wplY: 804e3, wplZ: 154e3, avZ: 3080.3, it: 282e3, iw: 196075e6, iRadY: 137.12008216489426, iRadZ: 35.47937347941777 }
  },
  "IPE360": {
    kind: "ISection",
    naam: "IPE 360",
    h: 360,
    b: 170,
    tw: 8,
    tf: 12.7,
    r: 18,
    props: { iz: 104e5, welY: 904e3, welZ: 123e3, wplY: 102e4, wplZ: 191e3, avZ: 3510.8, it: 373e3, iw: 309344e6, iRadY: 149.59826992945878, iRadZ: 37.82243317357027 }
  },
  "IPE400": {
    kind: "ISection",
    naam: "IPE 400",
    h: 400,
    b: 180,
    tw: 8.6,
    tf: 13.5,
    r: 21,
    props: { iz: 132e5, welY: 116e4, welZ: 146e3, wplY: 131e4, wplZ: 229e3, avZ: 4273.1, it: 511e3, iw: 482854e6, iRadY: 165.44721534401467, iRadZ: 39.52379254973886 }
  },
  "IPE450": {
    kind: "ISection",
    naam: "IPE 450",
    h: 450,
    b: 190,
    tw: 9.4,
    tf: 14.6,
    r: 21,
    props: { iz: 168e5, welY: 15e5, welZ: 176e3, wplY: 17e5, wplZ: 276e3, avZ: 5082.4, it: 669e3, iw: 780918e6, iRadY: 184.79663841869584, iRadZ: 41.23596559193922 }
  },
  "IPE500": {
    kind: "ISection",
    naam: "IPE 500",
    h: 500,
    b: 200,
    tw: 10.2,
    tf: 16,
    r: 21,
    props: { iz: 214e5, welY: 193e4, welZ: 214e3, wplY: 219e4, wplZ: 336e3, avZ: 6035.2, it: 893e3, iw: 123532e7, iRadY: 203.84240024570707, iRadZ: 42.951456159330576 }
  },
  "IPE550": {
    kind: "ISection",
    naam: "IPE 550",
    h: 550,
    b: 210,
    tw: 11.1,
    tf: 17.2,
    r: 24,
    props: { iz: 267e5, welY: 244e4, welZ: 254e3, wplY: 278e4, wplZ: 401e3, avZ: 7192.5, it: 123e4, iw: 186139e7, iRadY: 223.80695306179825, iRadZ: 44.63784620064946 }
  },
  "IPE600": {
    kind: "ISection",
    naam: "IPE 600",
    h: 600,
    b: 220,
    tw: 12,
    tf: 19,
    r: 24,
    props: { iz: 339e5, welY: 307e4, welZ: 308e3, wplY: 351e4, wplZ: 486e3, avZ: 8380, it: 165e4, iw: 281452e7, iRadY: 242.95193151247227, iRadZ: 46.616273157309806 }
  },
  "HEA100": {
    kind: "ISection",
    naam: "HEA 100",
    h: 96,
    b: 100,
    tw: 5,
    tf: 8,
    r: 12,
    props: { iz: 134e4, welY: 72800, welZ: 26800, wplY: 83e3, wplZ: 41100, avZ: 752, it: 52400, iw: 247465e4, iRadY: 40.57371581571424, iRadZ: 25.141111186622464 }
  },
  "HEA120": {
    kind: "ISection",
    naam: "HEA 120",
    h: 114,
    b: 120,
    tw: 5,
    tf: 8,
    r: 12,
    props: { iz: 231e4, welY: 106e3, welZ: 38500, wplY: 119e3, wplZ: 58900, avZ: 842, it: 59900, iw: 62835e5, iRadY: 48.941362026368324, iRadZ: 30.216609311120095 }
  },
  "HEA140": {
    kind: "ISection",
    naam: "HEA 140",
    h: 133,
    b: 140,
    tw: 5.5,
    tf: 8.5,
    r: 12,
    props: { iz: 389e4, welY: 155e3, welZ: 55600, wplY: 174e3, wplZ: 85200, avZ: 1010.8, it: 81300.00000000001, iw: 147267e5, iRadY: 57.273508510218434, iRadZ: 35.197350797818764 }
  },
  "HEA160": {
    kind: "ISection",
    naam: "HEA 160",
    h: 152,
    b: 160,
    tw: 6,
    tf: 9,
    r: 15,
    props: { iz: 616e4, welY: 22e4, welZ: 77e3, wplY: 245e3, wplZ: 118e3, avZ: 1324, it: 122e3, iw: 306112e5, iRadY: 65.60582071234386, iRadZ: 39.84506074759307 }
  },
  "HEA180": {
    kind: "ISection",
    naam: "HEA 180",
    h: 171,
    b: 180,
    tw: 6,
    tf: 9.5,
    r: 15,
    props: { iz: 925e4, welY: 294e3, welZ: 103e3, wplY: 325e3, wplZ: 157e3, avZ: 1452, it: 148e3, iw: 590078e5, iRadY: 74.43681113600401, iRadZ: 45.18785904262905 }
  },
  "HEA200": {
    kind: "ISection",
    naam: "HEA 200",
    h: 190,
    b: 200,
    tw: 6.5,
    tf: 10,
    r: 18,
    props: { iz: 134e5, welY: 389e3, welZ: 134e3, wplY: 43e4, wplZ: 204e3, avZ: 1805, it: 209800, iw: 105568e6, iRadY: 82.81748643541141, iRadZ: 49.9069766636149 }
  },
  "HEA220": {
    kind: "ISection",
    naam: "HEA 220",
    h: 210,
    b: 220,
    tw: 7,
    tf: 11,
    r: 18,
    props: { iz: 195e5, welY: 515e3, welZ: 177e3, wplY: 569e3, wplZ: 271e3, avZ: 2063, it: 285e3, iw: 189595e6, iRadY: 91.72614593227726, iRadZ: 55.06958696976234 }
  },
  "HEA240": {
    kind: "ISection",
    naam: "HEA 240",
    h: 230,
    b: 240,
    tw: 7.5,
    tf: 12,
    r: 21,
    props: { iz: 277e5, welY: 675e3, welZ: 231e3, wplY: 745e3, wplZ: 352e3, avZ: 2514, it: 416e3, iw: 321612e6, iRadY: 100.51948401512348, iRadZ: 60.056397105831564 }
  },
  "HEA260": {
    kind: "ISection",
    naam: "HEA 260",
    h: 250,
    b: 260,
    tw: 7.5,
    tf: 12.5,
    r: 24,
    props: { iz: 367e5, welY: 836e3, welZ: 282e3, wplY: 92e4, wplZ: 43e4, avZ: 2873.8, it: 524e3, iw: 504943e6, iRadY: 109.72315392346522, iRadZ: 65.02392328272988 }
  },
  "HEA280": {
    kind: "ISection",
    naam: "HEA 280",
    h: 270,
    b: 280,
    tw: 8,
    tf: 13,
    r: 24,
    props: { iz: 476e5, welY: 101e4, welZ: 34e4, wplY: 111e4, wplZ: 518e3, avZ: 3178, it: 621e3, iw: 770073e6, iRadY: 118.52987793379789, iRadZ: 69.9434509510022 }
  },
  "HEA300": {
    kind: "ISection",
    naam: "HEA 300",
    h: 290,
    b: 300,
    tw: 8.5,
    tf: 14,
    r: 27,
    props: { iz: 631e5, welY: 126e4, welZ: 421e3, wplY: 138e4, wplZ: 641e3, avZ: 3675, it: 852e3, iw: 117461e7, iRadY: 127.68543937572298, iRadZ: 75.05950020769238 }
  },
  "HEA320": {
    kind: "ISection",
    naam: "HEA 320",
    h: 310,
    b: 300,
    tw: 9,
    tf: 15.5,
    r: 27,
    props: { iz: 69852972, welY: 1479497, welZ: 465686, wplY: 1628366, wplZ: 709770, avZ: 4116, it: 1084313, iw: 148244e7, iRadY: 135.8, iRadZ: 74.9 }
  },
  "HEA340": {
    kind: "ISection",
    naam: "HEA 340",
    h: 330,
    b: 300,
    tw: 9.5,
    tf: 16.5,
    r: 27,
    props: { iz: 744e5, welY: 168e4, welZ: 496e3, wplY: 185e4, wplZ: 756e3, avZ: 4497.8, it: 127e4, iw: 179005e7, iRadY: 144.01934951147317, iRadZ: 74.65275418807512 }
  },
  "HEA360": {
    kind: "ISection",
    naam: "HEA 360",
    h: 350,
    b: 300,
    tw: 10,
    tf: 17.5,
    r: 27,
    props: { iz: 789e5, welY: 189e4, welZ: 526e3, wplY: 209e4, wplZ: 803e3, avZ: 4900, it: 149e4, iw: 21375e8, iRadY: 152.2244031276294, iRadZ: 74.33175690129767 }
  },
  "HEA400": {
    kind: "ISection",
    naam: "HEA 400",
    h: 390,
    b: 300,
    tw: 11,
    tf: 19,
    r: 27,
    props: { iz: 85638935, welY: 2311600, welZ: 570926, wplY: 2562154, wplZ: 872900, avZ: 5735, it: 1897649, iw: 289336e7, iRadY: 168.4, iRadZ: 73.4 }
  },
  "HEB100": {
    kind: "ISection",
    naam: "HEB 100",
    h: 100,
    b: 100,
    tw: 6,
    tf: 10,
    r: 12,
    props: { iz: 167e4, welY: 89900, welZ: 33500, wplY: 104e3, wplZ: 51400, avZ: 900, it: 92500, iw: 32313e5, iRadY: 41.60251471689218, iRadZ: 25.34379001467011 }
  },
  "HEB120": {
    kind: "ISection",
    naam: "HEB 120",
    h: 120,
    b: 120,
    tw: 6.5,
    tf: 11,
    r: 12,
    props: { iz: 318e4, welY: 144e3, welZ: 53e3, wplY: 165e3, wplZ: 81e3, avZ: 1095.5, it: 138e3, iw: 912233e4, iRadY: 50.410083025008355, iRadZ: 30.582578662484607 }
  },
  "HEB140": {
    kind: "ISection",
    naam: "HEB 140",
    h: 140,
    b: 140,
    tw: 7,
    tf: 12,
    r: 12,
    props: { iz: 55e5, welY: 216e3, welZ: 78500, wplY: 246e3, wplZ: 12e4, avZ: 1312, it: 201e3, iw: 219597e5, iRadY: 59.25899009413461, iRadZ: 35.764084881929534 }
  },
  "HEB160": {
    kind: "ISection",
    naam: "HEB 160",
    h: 160,
    b: 160,
    tw: 8,
    tf: 13,
    r: 15,
    props: { iz: 889e4, welY: 311e3, welZ: 111e3, wplY: 354e3, wplZ: 17e4, avZ: 1764, it: 312e3, iw: 466548e5, iRadY: 67.71731949151578, iRadZ: 40.46233726131315 }
  },
  "HEB180": {
    kind: "ISection",
    naam: "HEB 180",
    h: 180,
    b: 180,
    tw: 8.5,
    tf: 14,
    r: 15,
    props: { iz: 136e5, welY: 426e3, welZ: 151e3, wplY: 481e3, wplZ: 231e3, avZ: 2029, it: 422e3, iw: 917066e5, iRadY: 76.58483770305361, iRadZ: 45.6365561001259 }
  },
  "HEB200": {
    kind: "ISection",
    naam: "HEB 200",
    h: 200,
    b: 200,
    tw: 9,
    tf: 15,
    r: 18,
    props: { iz: 2e7, welY: 57e4, welZ: 2e5, wplY: 642e3, wplZ: 306e3, avZ: 2485, it: 593e3, iw: 16703e7, iRadY: 85.43029595728645, iRadZ: 50.604539936925754 }
  },
  "HEB220": {
    kind: "ISection",
    naam: "HEB 220",
    h: 220,
    b: 220,
    tw: 9.5,
    tf: 16,
    r: 18,
    props: { iz: 284e5, welY: 736e3, welZ: 258e3, wplY: 827e3, wplZ: 396e3, avZ: 2788, it: 766e3, iw: 289455e6, iRadY: 94.28737927267832, iRadZ: 55.86482901503522 }
  },
  "HEB240": {
    kind: "ISection",
    naam: "HEB 240",
    h: 240,
    b: 240,
    tw: 10,
    tf: 17,
    r: 21,
    props: { iz: 392e5, welY: 938e3, welZ: 327e3, wplY: 105e4, wplZ: 5e5, avZ: 3324, it: 103e4, iw: 476202e6, iRadY: 103.06619964582939, iRadZ: 60.81211398682971 }
  },
  "HEB260": {
    kind: "ISection",
    naam: "HEB 260",
    h: 260,
    b: 260,
    tw: 10,
    tf: 17.5,
    r: 24,
    props: { iz: 513e5, welY: 115e4, welZ: 395e3, wplY: 128e4, wplZ: 602e3, avZ: 3715, it: 124e4, iw: 736173e6, iRadY: 112.4458438387572, iRadZ: 65.93525329532483 }
  },
  "HEB280": {
    kind: "ISection",
    naam: "HEB 280",
    h: 280,
    b: 280,
    tw: 10.5,
    tf: 18,
    r: 24,
    props: { iz: 659e5, welY: 138e4, welZ: 471e3, wplY: 153e4, wplZ: 718e3, avZ: 4073, it: 144e4, iw: 110704e7, iRadY: 121.28447412641957, iRadZ: 70.92625995458268 }
  },
  "HEB300": {
    kind: "ISection",
    naam: "HEB 300",
    h: 300,
    b: 300,
    tw: 11,
    tf: 19,
    r: 27,
    props: { iz: 856e5, welY: 168e4, welZ: 571e3, wplY: 187e4, wplZ: 871e3, avZ: 4735, it: 185e4, iw: 165079e7, iRadY: 129.97160247401902, iRadZ: 75.79555688134378 }
  },
  "HEB320": {
    kind: "ISection",
    naam: "HEB 320",
    h: 320,
    b: 300,
    tw: 11.5,
    tf: 20.5,
    r: 27,
    props: { iz: 924e5, welY: 193e4, welZ: 616e3, wplY: 215e4, wplZ: 94e4, avZ: 5172.8, it: 225e4, iw: 202587e7, iRadY: 138.22898959619909, iRadZ: 75.68656613047285 }
  },
  "HEB340": {
    kind: "ISection",
    naam: "HEB 340",
    h: 340,
    b: 300,
    tw: 12,
    tf: 21.5,
    r: 27,
    props: { iz: 969e5, welY: 216e4, welZ: 646e3, wplY: 241e4, wplZ: 986e3, avZ: 5609, it: 257e4, iw: 240523e7, iRadY: 146.46208047866608, iRadZ: 75.29928582579505 }
  },
  "HEB360": {
    kind: "ISection",
    naam: "HEB 360",
    h: 360,
    b: 300,
    tw: 12.5,
    tf: 22.5,
    r: 27,
    props: { iz: 1014e5, welY: 24e5, welZ: 676e3, wplY: 268e4, wplZ: 103e4, avZ: 6056.3, it: 293e4, iw: 282889e7, iRadY: 154.64387696307455, iRadZ: 74.93075430155055 }
  },
  "HEB400": {
    kind: "ISection",
    naam: "HEB 400",
    h: 400,
    b: 300,
    tw: 13.5,
    tf: 24,
    r: 27,
    props: { iz: 1082e5, welY: 288e4, welZ: 721e3, wplY: 323e4, wplZ: 11e5, avZ: 7e3, it: 356e4, iw: 375056e7, iRadY: 170.76524369139878, iRadZ: 73.96061040039345 }
  },
  "HEM100": {
    kind: "ISection",
    naam: "HEM 100",
    h: 120,
    b: 106,
    tw: 12,
    tf: 20,
    r: 12,
    props: { iz: 399e4, welY: 19e4, welZ: 75300, wplY: 235e3, wplZ: 117e3, avZ: 1800, it: 682100, iw: 941747e4, iRadY: 46.29100498862757, iRadZ: 27.386127875258307 }
  },
  "HEM120": {
    kind: "ISection",
    naam: "HEM 120",
    h: 140,
    b: 126,
    tw: 12.5,
    tf: 21,
    r: 12,
    props: { iz: 703e4, welY: 288e3, welZ: 112e3, wplY: 35e4, wplZ: 172e3, avZ: 2114.5, it: 916600, iw: 238624e5, iRadY: 55.15585802703821, iRadZ: 32.53820738392077 }
  },
  "HEM140": {
    kind: "ISection",
    naam: "HEM 140",
    h: 160,
    b: 146,
    tw: 13,
    tf: 22,
    r: 12,
    props: { iz: 114e5, welY: 411e3, welZ: 156e3, wplY: 496e3, wplZ: 241e3, avZ: 2450, it: 12e5, iw: 527826e5, iRadY: 63.88963809632517, iRadZ: 37.60840410803615 }
  },
  "HEM160": {
    kind: "ISection",
    naam: "HEM 160",
    h: 180,
    b: 166,
    tw: 14,
    tf: 23,
    r: 15,
    props: { iz: 176e5, welY: 566e3, welZ: 212e3, wplY: 675e3, wplZ: 327e3, avZ: 3086, it: 1624e3, iw: 104627e6, iRadY: 72.47287215754707, iRadZ: 42.57422185586412 }
  },
  "HEM180": {
    kind: "ISection",
    naam: "HEM 180",
    h: 200,
    b: 186,
    tw: 14.5,
    tf: 24,
    r: 15,
    props: { iz: 258e5, welY: 748e3, welZ: 277e3, wplY: 884e3, wplZ: 428e3, avZ: 3440, it: 2033e3, iw: 194181e6, iRadY: 81.36011938627347, iRadZ: 47.78269394569507 }
  },
  "HEM200": {
    kind: "ISection",
    naam: "HEM 200",
    h: 220,
    b: 206,
    tw: 15,
    tf: 25,
    r: 18,
    props: { iz: 365e5, welY: 967e3, welZ: 354e3, wplY: 114e4, wplZ: 549e3, avZ: 4075, it: 2594e3, iw: 336686e6, iRadY: 90.12290166533784, iRadZ: 52.78503141975699 }
  },
  "HEM220": {
    kind: "ISection",
    naam: "HEM 220",
    h: 240,
    b: 226,
    tw: 15.5,
    tf: 26,
    r: 18,
    props: { iz: 502e5, welY: 122e4, welZ: 444e3, wplY: 143e4, wplZ: 69e4, avZ: 4487, it: 3153e3, iw: 559281e6, iRadY: 98.9881695866774, iRadZ: 58.04418589986876 }
  },
  "HEM240": {
    kind: "ISection",
    naam: "HEM 240",
    h: 270,
    b: 248,
    tw: 18,
    tf: 32,
    r: 21,
    props: { iz: 815e5, welY: 18e5, welZ: 657e3, wplY: 212e4, wplZ: 102e4, avZ: 6048, it: 6279e3, iw: 112285e7, iRadY: 110.20435563080073, iRadZ: 63.835726674018524 }
  },
  "HEM260": {
    kind: "ISection",
    naam: "HEM 260",
    h: 290,
    b: 268,
    tw: 18,
    tf: 32.5,
    r: 24,
    props: { iz: 1045e5, welY: 216e4, welZ: 78e4, wplY: 253e4, wplZ: 121e4, avZ: 6725, it: 719e4, iw: 168308e7, iRadY: 119.29718429962286, iRadZ: 68.92024376045111 }
  },
  "HEM280": {
    kind: "ISection",
    naam: "HEM 280",
    h: 310,
    b: 288,
    tw: 18.5,
    tf: 33,
    r: 24,
    props: { iz: 1316e5, welY: 255e4, welZ: 914e3, wplY: 297e4, wplZ: 142e4, avZ: 7186.5, it: 8073e3, iw: 246184e7, iRadY: 128.3712065327216, iRadZ: 74.04953297174353 }
  },
  "HEM300": {
    kind: "ISection",
    naam: "HEM 300",
    h: 340,
    b: 310,
    tw: 21,
    tf: 39,
    r: 27,
    props: { iz: 194e6, welY: 348e4, welZ: 125e4, wplY: 408e4, wplZ: 195e4, avZ: 9045, it: 1408e4, iw: 427798e7, iRadY: 139.77823076351888, iRadZ: 80.01649994861312 }
  },
  "SHS80X80X4": {
    kind: "Shs",
    naam: "SHS 80x80x4",
    h: 80,
    b: 80,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 1144550, welY: 28613.9, welZ: 28613.9, wplY: 33975.5, wplZ: 33975.5, avZ: 599.416, it: 1793520, iw: 0, iRadY: 30.8986, iRadZ: 30.8986 }
  },
  "SHS100X100X5": {
    kind: "Shs",
    naam: "SHS 100x100x5",
    h: 100,
    b: 100,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 2794320, welY: 55886.5, welZ: 55886.5, wplY: 66358.4, wplZ: 66358.4, avZ: 936.587, it: 4378720, iw: 0, iRadY: 38.6233, iRadZ: 38.6233 }
  },
  "SHS120X120X5": {
    kind: "Shs",
    naam: "SHS 120x120x5",
    h: 120,
    b: 120,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 4977140, welY: 82952.4, welZ: 82952.4, wplY: 97590.1, wplZ: 97590.1, avZ: 1136.59, it: 7746560, iw: 0, iRadY: 46.7922, iRadZ: 46.7922 }
  },
  "SHS150X150X6": {
    kind: "Shs",
    naam: "SHS 150x150x6",
    h: 150,
    b: 150,
    tw: 6,
    tf: 6,
    r: 9,
    props: { iz: 11735600, welY: 156474, welZ: 156474, wplY: 183748, wplZ: 183748, avZ: 1708.69, it: 18240300, iw: 0, iRadY: 58.6011, iRadZ: 58.6011 }
  },
  "SHS200X200X8": {
    kind: "Shs",
    naam: "SHS 200x200x8",
    h: 200,
    b: 200,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 37090100, welY: 370901, welZ: 370901, wplY: 435550, wplZ: 435550, avZ: 3037.66, it: 57648400, iw: 0, iRadY: 78.1348, iRadZ: 78.1348 }
  },
  "SHS250X250X10": {
    kind: "Shs",
    naam: "SHS 250x250x10",
    h: 250,
    b: 250,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 90552100, welY: 724417, welZ: 724417, wplY: 850684, wplZ: 850684, avZ: 4746.35, it: 140743e3, iw: 0, iRadY: 97.6685, iRadZ: 97.6685 }
  },
  "SHS300X300X10": {
    kind: "Shs",
    naam: "SHS 300x300x10",
    h: 300,
    b: 300,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 160261e3, welY: 1068410, welZ: 1068410, wplY: 1245500, wplZ: 1245500, avZ: 5746.35, it: 247695e3, iw: 0, iRadY: 118.087, iRadZ: 118.087 }
  },
  "RHS100X50X4": {
    kind: "Rhs",
    naam: "RHS 100x50x4",
    h: 100,
    b: 50,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 461881, welY: 27920, welZ: 18475.2, wplY: 35243.8, wplZ: 21473, avZ: 745.888, it: 1121910, iw: 0, iRadY: 35.3232, iRadZ: 20.3181 }
  },
  "RHS120X60X5": {
    kind: "Rhs",
    naam: "RHS 120x60x5",
    h: 120,
    b: 60,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 987592, welY: 49869, welZ: 32919.7, wplY: 63090.1, wplZ: 38394.9, avZ: 1115.45, it: 2404260, iw: 0, iRadY: 42.2883, iRadZ: 24.2951 }
  },
  "RHS150X100X6": {
    kind: "Rhs",
    naam: "RHS 150x100x6",
    h: 150,
    b: 100,
    tw: 6,
    tf: 6,
    r: 9,
    props: { iz: 4559020, welY: 114978, welZ: 91180.4, wplY: 140548, wplZ: 105814, avZ: 1690.42, it: 9427380, iw: 0, iRadY: 55.3243, iRadZ: 40.2266 }
  },
  "RHS200X100X8": {
    kind: "Rhs",
    naam: "RHS 200x100x8",
    h: 200,
    b: 100,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 7390090, welY: 223360, welZ: 147802, wplY: 281950, wplZ: 171784, avZ: 2983.55, it: 17950500, iw: 0, iRadY: 70.6465, iRadZ: 40.6362 }
  },
  "RHS250X150X8": {
    kind: "Rhs",
    naam: "RHS 250x150x8",
    h: 250,
    b: 150,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 22980100, welY: 408915, welZ: 306401, wplY: 500634, wplZ: 350467, avZ: 3797.08, it: 50077500, iw: 0, iRadY: 91.7248, iRadZ: 61.5023 }
  },
  "RHS300X200X10": {
    kind: "Rhs",
    naam: "RHS 300x200x10",
    h: 300,
    b: 200,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 62775800, welY: 787962, welZ: 627758, wplY: 955502, wplZ: 720867, avZ: 5695.62, it: 128764e3, iw: 0, iRadY: 111.584, iRadZ: 81.3208 }
  },
  "CHS424X32": {
    kind: "Chs",
    naam: "CHS 42.4x3.2",
    h: 42.4,
    b: 42.4,
    tw: 3.2,
    tf: 3.2,
    r: 0,
    props: { iz: 76199.6, welY: 3594.32, welZ: 3594.32, wplY: 4928.17, wplZ: 4928.17, avZ: 250.88, it: 152399, iw: 0, iRadY: 13.9054, iRadZ: 13.9054 }
  },
  "CHS483X32": {
    kind: "Chs",
    naam: "CHS 48.3x3.2",
    h: 48.3,
    b: 48.3,
    tw: 3.2,
    tf: 3.2,
    r: 0,
    props: { iz: 115857, welY: 4797.37, welZ: 4797.37, wplY: 6519.75, wplZ: 6519.75, avZ: 288.64, it: 231713, iw: 0, iRadY: 15.9853, iRadZ: 15.9853 }
  },
  "CHS603X40": {
    kind: "Chs",
    naam: "CHS 60.3x4.0",
    h: 60.3,
    b: 60.3,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 281729, welY: 9344.25, welZ: 9344.25, wplY: 12700.1, wplZ: 12700.1, avZ: 450.4, it: 563458, iw: 0, iRadY: 19.9552, iRadZ: 19.9552 }
  },
  "CHS761X50": {
    kind: "Chs",
    naam: "CHS 76.1x5.0",
    h: 76.1,
    b: 76.1,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 709220, welY: 18639.2, welZ: 18639.2, wplY: 25317.7, wplZ: 25317.7, avZ: 711, it: 1418440, iw: 0, iRadY: 25.1997, iRadZ: 25.1997 }
  },
  "CHS889X50": {
    kind: "Chs",
    naam: "CHS 88.9x5.0",
    h: 88.9,
    b: 88.9,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 1163740, welY: 26180.8, welZ: 26180.8, wplY: 35237.7, wplZ: 35237.7, avZ: 839, it: 2327480, iw: 0, iRadY: 29.7158, iRadZ: 29.7158 }
  },
  "CHS1143X63": {
    kind: "Chs",
    naam: "CHS 114.3x6.3",
    h: 114.3,
    b: 114.3,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 3127140, welY: 54718.1, welZ: 54718.1, wplY: 73566.5, wplZ: 73566.5, avZ: 1360.8, it: 6254280, iw: 0, iRadY: 38.2487, iRadZ: 38.2487 }
  },
  "CHS1397X80": {
    kind: "Chs",
    naam: "CHS 139.7x8.0",
    h: 139.7,
    b: 139.7,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 7202890, welY: 103119, welZ: 103119, wplY: 138930, wplZ: 138930, avZ: 2107.2, it: 14405800, iw: 0, iRadY: 46.6488, iRadZ: 46.6488 }
  },
  "CHS1683X80": {
    kind: "Chs",
    naam: "CHS 168.3x8.0",
    h: 168.3,
    b: 168.3,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 12972700, welY: 154162, welZ: 154162, wplY: 205739, wplZ: 205739, avZ: 2564.8, it: 25945400, iw: 0, iRadY: 56.7451, iRadZ: 56.7451 }
  },
  "CHS2191X10": {
    kind: "Chs",
    naam: "CHS 219.1x10",
    h: 219.1,
    b: 219.1,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 35984400, welY: 328475, welZ: 328475, wplY: 437561, wplZ: 437561, avZ: 4182, it: 71968800, iw: 0, iRadY: 74.0125, iRadZ: 74.0125 }
  },
  "CHS273X10": {
    kind: "Chs",
    naam: "CHS 273x10",
    h: 273,
    b: 273,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 71540900, welY: 524109, welZ: 524109, wplY: 692023, wplZ: 692023, avZ: 5260, it: 143082e3, iw: 0, iRadY: 93.0517, iRadZ: 93.0517 }
  },
  "CHS3239X125": {
    kind: "Chs",
    naam: "CHS 323.9x12.5",
    h: 323.9,
    b: 323.9,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 148465e3, welY: 916735, welZ: 916735, wplY: 1212780, wplZ: 1212780, avZ: 7785, it: 296931e3, iw: 0, iRadY: 110.185, iRadZ: 110.185 }
  },
  "CHS4064X16": {
    kind: "Chs",
    naam: "CHS 406.4x16",
    h: 406.4,
    b: 406.4,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 374488e3, welY: 1842950, welZ: 1842950, wplY: 2439960, wplZ: 2439960, avZ: 12492.8, it: 748976e3, iw: 0, iRadY: 138.143, iRadZ: 138.143 }
  },
  "UNP80": {
    kind: "Channel",
    naam: "UNP 80",
    h: 80,
    b: 45,
    tw: 6,
    tf: 8,
    r: 8,
    flensHelling: 0.08,
    props: { iz: 193581, welY: 26482.5, welZ: 6351.06, wplY: 31898.3, wplZ: 12081.4, avZ: 494.34, it: 21519.2, iw: 167587e3, iRadY: 30.9993, iRadZ: 13.2517 }
  },
  "UNP100": {
    kind: "Channel",
    naam: "UNP 100",
    h: 100,
    b: 50,
    tw: 6,
    tf: 8.5,
    r: 8.5,
    flensHelling: 0.08,
    props: { iz: 292339, welY: 41100.7, welZ: 8479.91, wplY: 48997.9, wplZ: 16238.1, avZ: 619.39, it: 28212.4, iw: 413199e3, iRadY: 39.0719, iRadZ: 14.7366 }
  },
  "UNP120": {
    kind: "Channel",
    naam: "UNP 120",
    h: 120,
    b: 55,
    tw: 7,
    tf: 9,
    r: 9,
    flensHelling: 0.08,
    props: { iz: 430621, welY: 60721.6, welZ: 11058.5, wplY: 72701.8, wplZ: 21267.6, avZ: 852.712, it: 41383.5, iw: 898945e3, iRadY: 46.3113, iRadZ: 15.9216 }
  },
  "UNP140": {
    kind: "Channel",
    naam: "UNP 140",
    h: 140,
    b: 60,
    tw: 7,
    tf: 10,
    r: 10,
    flensHelling: 0.08,
    props: { iz: 624853, welY: 86401.9, welZ: 14721.2, wplY: 102773, wplZ: 28319.1, avZ: 1006.98, it: 57117.5, iw: 179977e4, iRadY: 54.4901, iRadZ: 17.5144 }
  },
  "UNP160": {
    kind: "Channel",
    naam: "UNP 160",
    h: 160,
    b: 65,
    tw: 7.5,
    tf: 10.5,
    r: 10.5,
    flensHelling: 0.08,
    props: { iz: 852430, welY: 115658, welZ: 18298, wplY: 137608, wplZ: 35219.7, avZ: 1226.39, it: 74262.4, iw: 326004e4, iRadY: 62.0599, iRadZ: 18.8368 }
  },
  "UNP180": {
    kind: "Channel",
    naam: "UNP 180",
    h: 180,
    b: 70,
    tw: 8,
    tf: 11,
    r: 11,
    flensHelling: 0.08,
    props: { iz: 1134990, welY: 150434, welZ: 22379.6, wplY: 179115, wplZ: 43068.1, avZ: 1465.57, it: 95049, iw: 556745e4, iRadY: 69.5796, iRadZ: 20.1457 }
  },
  "UNP200": {
    kind: "Channel",
    naam: "UNP 200",
    h: 200,
    b: 75,
    tw: 8.5,
    tf: 11.5,
    r: 11.5,
    flensHelling: 0.08,
    props: { iz: 1480500, welY: 191181, welZ: 26998, wplY: 227850, wplZ: 51957.7, avZ: 1724.53, it: 119949, iw: 906587e4, iRadY: 77.0594, iRadZ: 21.4441 }
  },
  "UNP220": {
    kind: "Channel",
    naam: "UNP 220",
    h: 220,
    b: 80,
    tw: 9,
    tf: 12.5,
    r: 12.5,
    flensHelling: 0.08,
    props: { iz: 1962440, welY: 244758, welZ: 33526.1, wplY: 291604, wplZ: 64456.3, avZ: 2014.28, it: 161334, iw: 145854e5, iRadY: 84.7828, iRadZ: 22.8898 }
  },
  "UNP240": {
    kind: "Channel",
    naam: "UNP 240",
    h: 240,
    b: 85,
    tw: 9.5,
    tf: 13,
    r: 13,
    flensHelling: 0.08,
    props: { iz: 2474410, welY: 299901, welZ: 39503.1, wplY: 357666, wplZ: 75960.7, avZ: 2313.17, it: 197903, iw: 220703e5, iRadY: 92.2306, iRadZ: 24.1842 }
  },
  "UNP260": {
    kind: "Channel",
    naam: "UNP 260",
    h: 260,
    b: 90,
    tw: 10,
    tf: 14,
    r: 14,
    flensHelling: 0.08,
    props: { iz: 3172710, welY: 371092, welZ: 47838.3, wplY: 442407, wplZ: 91910.2, avZ: 2644.25, it: 257156, iw: 33269e6, iRadY: 99.9581, iRadZ: 25.6342 }
  },
  "UNP280": {
    kind: "Channel",
    naam: "UNP 280",
    h: 280,
    b: 95,
    tw: 10,
    tf: 15,
    r: 15,
    flensHelling: 0.08,
    props: { iz: 3981970, welY: 448279, welZ: 57151.5, wplY: 531962, wplZ: 109812, avZ: 2866.98, it: 313525, iw: 484731e5, iRadY: 108.39, iRadZ: 27.3022 }
  },
  "UNP300": {
    kind: "Channel",
    naam: "UNP 300",
    h: 300,
    b: 100,
    tw: 10,
    tf: 16,
    r: 16,
    flensHelling: 0.08,
    props: { iz: 4931510, welY: 535178, welZ: 67559.6, wplY: 632364, wplZ: 129913, avZ: 3092.24, it: 379641, iw: 689843e5, iRadY: 116.881, iRadZ: 28.9695 }
  },
  "HEA450": {
    kind: "ISection",
    naam: "HEA 450",
    h: 440,
    b: 300,
    tw: 11.5,
    tf: 21,
    r: 27,
    props: { iz: 94653300, welY: 2896440, welZ: 631022, wplY: 3215870, wplZ: 965531, avZ: 6578.28, it: 2501090, iw: 408679e7, iRadY: 189.191, iRadZ: 72.9162 }
  },
  "HEA500": {
    kind: "ISection",
    naam: "HEA 500",
    h: 490,
    b: 300,
    tw: 12,
    tf: 23,
    r: 27,
    props: { iz: 103671e3, welY: 3549990, welZ: 691137, wplY: 3948860, wplZ: 1058510, avZ: 7471.78, it: 3178150, iw: 55687e8, iRadY: 209.832, iRadZ: 72.444 }
  },
  "HEA550": {
    kind: "ISection",
    naam: "HEA 550",
    h: 540,
    b: 300,
    tw: 12.5,
    tf: 24,
    r: 27,
    props: { iz: 10819e4, welY: 4145640, welZ: 721270, wplY: 4621820, wplZ: 1106900, avZ: 8371.78, it: 3603560, iw: 710242e7, iRadY: 229.91, iRadZ: 71.4784 }
  },
  "HEA600": {
    kind: "ISection",
    naam: "HEA 600",
    h: 590,
    b: 300,
    tw: 13,
    tf: 25,
    r: 27,
    props: { iz: 112713e3, welY: 4786720, welZ: 751421, wplY: 5350390, wplZ: 1155660, avZ: 9320.78, it: 4068810, iw: 887882e7, iRadY: 249.71, iRadZ: 70.5495 }
  },
  "HEA650": {
    kind: "ISection",
    naam: "HEA 650",
    h: 640,
    b: 300,
    tw: 13.5,
    tf: 26,
    r: 27,
    props: { iz: 117239e3, welY: 5474320, welZ: 781592, wplY: 6136290, wplZ: 1204790, avZ: 10318.8, it: 4576040, iw: 109141e8, iRadY: 269.251, iRadZ: 69.6552 }
  },
  "HEA700": {
    kind: "ISection",
    naam: "HEA 700",
    h: 690,
    b: 300,
    tw: 14.5,
    tf: 27,
    r: 27,
    props: { iz: 121788e3, welY: 6240620, welZ: 811920, wplY: 7031820, wplZ: 1256740, avZ: 11697.3, it: 5215450, iw: 132221e8, iRadY: 287.5, iRadZ: 68.3781 }
  },
  "HEA800": {
    kind: "ISection",
    naam: "HEA 800",
    h: 790,
    b: 300,
    tw: 15,
    tf: 28,
    r: 30,
    props: { iz: 126387e3, welY: 7682090, welZ: 842578, wplY: 8699490, wplZ: 1312260, avZ: 13882.6, it: 6086330, iw: 181119e8, iRadY: 325.827, iRadZ: 66.4967 }
  },
  "HEA900": {
    kind: "ISection",
    naam: "HEA 900",
    h: 890,
    b: 300,
    tw: 16,
    tf: 30,
    r: 30,
    props: { iz: 135475e3, welY: 9484830, welZ: 903165, wplY: 10811e3, wplZ: 1414480, avZ: 16332.6, it: 7490140, iw: 247466e8, iRadY: 362.88, iRadZ: 65.0126 }
  },
  "HEA1000": {
    kind: "ISection",
    naam: "HEA 1000",
    h: 990,
    b: 300,
    tw: 16.5,
    tf: 31,
    r: 30,
    props: { iz: 140045e3, welY: 11188800, welZ: 933630, wplY: 12824400, wplZ: 1469710, avZ: 18456.1, it: 8348450, iw: 318315e8, iRadY: 399.601, iRadZ: 63.5426 }
  },
  "HEB450": {
    kind: "ISection",
    naam: "HEB 450",
    h: 450,
    b: 300,
    tw: 14,
    tf: 26,
    r: 27,
    props: { iz: 117213e3, welY: 3550560, welZ: 781422, wplY: 3982370, wplZ: 1197660, avZ: 7965.78, it: 4479740, iw: 517692e7, iRadY: 191.44, iRadZ: 73.3301 }
  },
  "HEB500": {
    kind: "ISection",
    naam: "HEB 500",
    h: 500,
    b: 300,
    tw: 14.5,
    tf: 28,
    r: 27,
    props: { iz: 126239e3, welY: 4287030, welZ: 841595, wplY: 4814570, wplZ: 1291650, avZ: 8981.78, it: 5481370, iw: 691975e7, iRadY: 211.923, iRadZ: 72.7323 }
  },
  "HEB550": {
    kind: "ISection",
    naam: "HEB 550",
    h: 550,
    b: 300,
    tw: 15,
    tf: 29,
    r: 27,
    props: { iz: 130769e3, welY: 4970580, welZ: 871793, wplY: 5590610, wplZ: 1341140, avZ: 10006.8, it: 6101730, iw: 874268e7, iRadY: 231.955, iRadZ: 71.7441 }
  },
  "HEB600": {
    kind: "ISection",
    naam: "HEB 600",
    h: 600,
    b: 300,
    tw: 15.5,
    tf: 30,
    r: 27,
    props: { iz: 135302e3, welY: 5701370, welZ: 902016, wplY: 6425140, wplZ: 1391060, avZ: 11080.8, it: 6771260, iw: 108364e8, iRadY: 251.711, iRadZ: 70.7954 }
  },
  "HEB650": {
    kind: "ISection",
    naam: "HEB 650",
    h: 650,
    b: 300,
    tw: 16,
    tf: 31,
    r: 27,
    props: { iz: 13984e4, welY: 6480500, welZ: 932266, wplY: 7319880, wplZ: 1441410, avZ: 12203.8, it: 7492240, iw: 132171e8, iRadY: 271.21, iRadZ: 69.8838 }
  },
  "HEB700": {
    kind: "ISection",
    naam: "HEB 700",
    h: 700,
    b: 300,
    tw: 17,
    tf: 32,
    r: 27,
    props: { iz: 144409e3, welY: 7339670, welZ: 962724, wplY: 8327130, wplZ: 1495040, avZ: 13709.8, it: 8388250, iw: 15898e9, iRadY: 289.563, iRadZ: 68.6543 }
  },
  "HEB800": {
    kind: "ISection",
    naam: "HEB 800",
    h: 800,
    b: 300,
    tw: 17.5,
    tf: 33,
    r: 30,
    props: { iz: 149037e3, welY: 8977090, welZ: 993578, wplY: 10228700, wplZ: 1553130, avZ: 16175.1, it: 9587010, iw: 216149e8, iRadY: 327.801, iRadZ: 66.782 }
  },
  "HEB900": {
    kind: "ISection",
    naam: "HEB 900",
    h: 900,
    b: 300,
    tw: 18.5,
    tf: 35,
    r: 30,
    props: { iz: 158159e3, welY: 10979200, welZ: 1054390, wplY: 12584100, wplZ: 1658340, avZ: 18875.1, it: 11501900, iw: 291934e8, iRadY: 364.791, iRadZ: 65.2678 }
  },
  "HEB1000": {
    kind: "ISection",
    naam: "HEB 1000",
    h: 1e3,
    b: 300,
    tw: 19,
    tf: 36,
    r: 30,
    props: { iz: 162758e3, welY: 12895e3, welZ: 1085050, wplY: 14855100, wplZ: 1716270, avZ: 21248.6, it: 12670800, iw: 37337e9, iRadY: 401.458, iRadZ: 63.7846 }
  },
  "HEM320": {
    kind: "ISection",
    naam: "HEM 320",
    h: 359,
    b: 309,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 197093e3, welY: 3795810, welZ: 1275680, wplY: 4435030, wplZ: 1950720, avZ: 9484.78, it: 15060200, iw: 488762e7, iRadY: 147.766, iRadZ: 79.474 }
  },
  "HEM340": {
    kind: "ISection",
    naam: "HEM 340",
    h: 377,
    b: 309,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 197107e3, welY: 4051550, welZ: 1275770, wplY: 4717570, wplZ: 1952710, avZ: 9862.78, it: 15115700, iw: 54608e8, iRadY: 155.504, iRadZ: 78.9998 }
  },
  "HEM360": {
    kind: "ISection",
    naam: "HEM 360",
    h: 395,
    b: 308,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 195218e3, welY: 4297060, welZ: 1267650, wplY: 4989320, wplZ: 1942350, avZ: 10240.8, it: 15128600, iw: 600672e7, iRadY: 163.157, iRadZ: 78.2519 }
  },
  "HEM400": {
    kind: "ISection",
    naam: "HEM 400",
    h: 432,
    b: 307,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 193355e3, welY: 4820330, welZ: 1259640, wplY: 5570620, wplZ: 1934130, avZ: 11017.8, it: 15200200, iw: 726606e7, iRadY: 178.774, iRadZ: 77.0401 }
  },
  "HEM450": {
    kind: "ISection",
    naam: "HEM 450",
    h: 478,
    b: 307,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 19339e4, welY: 5501440, welZ: 1259870, wplY: 6331020, wplZ: 1939200, avZ: 11983.8, it: 15342200, iw: 90893e8, iRadY: 197.984, iRadZ: 75.9297 }
  },
  "HEM500": {
    kind: "ISection",
    naam: "HEM 500",
    h: 524,
    b: 306,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 191547e3, welY: 6180490, welZ: 1251940, wplY: 7094270, wplZ: 1932020, avZ: 12949.8, it: 15441500, iw: 110084e8, iRadY: 216.868, iRadZ: 74.5883 }
  },
  "HEM550": {
    kind: "ISection",
    naam: "HEM 550",
    h: 572,
    b: 306,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 191584e3, welY: 6922520, welZ: 1252180, wplY: 7932680, wplZ: 1937310, avZ: 13957.8, it: 15589700, iw: 133198e8, iRadY: 236.364, iRadZ: 73.527 }
  },
  "HEM600": {
    kind: "ISection",
    naam: "HEM 600",
    h: 620,
    b: 305,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 189755e3, welY: 7659600, welZ: 1244290, wplY: 8772090, wplZ: 1930380, avZ: 14965.8, it: 15695200, iw: 156969e8, iRadY: 255.527, iRadZ: 72.2353 }
  },
  "HEM650": {
    kind: "ISection",
    naam: "HEM 650",
    h: 668,
    b: 305,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 189792e3, welY: 8433160, welZ: 1244540, wplY: 9656960, wplZ: 1935670, avZ: 15973.8, it: 15843400, iw: 184229e8, iRadY: 274.527, iRadZ: 71.2615 }
  },
  "HEM700": {
    kind: "ISection",
    naam: "HEM 700",
    h: 716,
    b: 304,
    tw: 21,
    tf: 40,
    r: 27,
    props: { iz: 187974e3, welY: 9197710, welZ: 1236670, wplY: 10539e3, wplZ: 1928780, avZ: 16981.8, it: 15948900, iw: 211575e8, iRadY: 293.205, iRadZ: 70.0551 }
  },
  "HEM800": {
    kind: "ISection",
    naam: "HEM 800",
    h: 814,
    b: 303,
    tw: 21,
    tf: 40,
    r: 30,
    props: { iz: 186274e3, welY: 10874600, welZ: 1229530, wplY: 12487700, wplZ: 1930390, avZ: 19426.6, it: 16573700, iw: 274684e8, iRadY: 330.881, iRadZ: 67.8801 }
  },
  "HEM900": {
    kind: "ISection",
    naam: "HEM 900",
    h: 910,
    b: 302,
    tw: 21,
    tf: 40,
    r: 30,
    props: { iz: 184518e3, welY: 12537e3, welZ: 1221970, wplY: 14441800, wplZ: 1928880, avZ: 21442.6, it: 16827400, iw: 344149e8, iRadY: 366.954, iRadZ: 65.9975 }
  },
  "HEM1000": {
    kind: "ISection",
    naam: "HEM 1000",
    h: 1008,
    b: 302,
    tw: 21,
    tf: 40,
    r: 30,
    props: { iz: 184593e3, welY: 14331300, welZ: 1222470, wplY: 16567900, wplZ: 1939680, avZ: 23500.6, it: 17129900, iw: 426603e8, iRadY: 403.243, iRadZ: 64.4638 }
  },
  "UPE80": {
    kind: "Channel",
    naam: "UPE 80",
    h: 80,
    b: 50,
    tw: 4,
    tf: 7,
    r: 10,
    flensHelling: 0,
    props: { iz: 254133, welY: 26801.1, welZ: 7984.04, wplY: 31226.5, wplZ: 13945.3, avZ: 404.92, it: 14593.9, iw: 237134e3, iRadY: 32.6294, iRadZ: 15.8867 }
  },
  "UPE100": {
    kind: "Channel",
    naam: "UPE 100",
    h: 100,
    b: 55,
    tw: 4.5,
    tf: 7.5,
    r: 10,
    flensHelling: 0,
    props: { iz: 382139, welY: 41372.6, welZ: 10633.7, wplY: 48012.6, wplZ: 18876.9, avZ: 534.17, it: 20069, iw: 568125e3, iRadY: 40.6737, iRadZ: 17.4817 }
  },
  "UPE120": {
    kind: "Channel",
    naam: "UPE 120",
    h: 120,
    b: 60,
    tw: 5,
    tf: 8,
    r: 12,
    flensHelling: 0,
    props: { iz: 553982, welY: 60583.7, welZ: 13791.1, wplY: 70328.2, wplZ: 24799.8, avZ: 717.805, it: 28790.1, iw: 119715e4, iRadY: 48.5555, iRadZ: 18.9554 }
  },
  "UPE140": {
    kind: "Channel",
    naam: "UPE 140",
    h: 140,
    b: 65,
    tw: 5,
    tf: 9,
    r: 12,
    flensHelling: 0,
    props: { iz: 787006, welY: 85637.4, welZ: 18188.8, wplY: 98844.5, wplZ: 32579.6, avZ: 824.805, it: 40316.4, iw: 233721e4, iRadY: 57.0504, iRadZ: 20.6713 }
  },
  "UPE160": {
    kind: "Channel",
    naam: "UPE 160",
    h: 160,
    b: 70,
    tw: 5.5,
    tf: 9.5,
    r: 12,
    flensHelling: 0,
    props: { iz: 1068250, welY: 113883, welZ: 22582.4, wplY: 131610, wplZ: 40723.3, avZ: 1003.56, it: 51875.1, iw: 417965e4, iRadY: 64.8356, iRadZ: 22.2012 }
  },
  "UPE180": {
    kind: "Channel",
    naam: "UPE 180",
    h: 180,
    b: 75,
    tw: 5.5,
    tf: 10.5,
    r: 12,
    flensHelling: 0,
    props: { iz: 1437050, welY: 150382, welZ: 28556.8, wplY: 172990, wplZ: 51296.3, avZ: 1120.06, it: 69821.2, iw: 715819e4, iRadY: 73.4125, iRadZ: 23.9214 }
  },
  "UPE200": {
    kind: "Channel",
    naam: "UPE 200",
    h: 200,
    b: 80,
    tw: 6,
    tf: 11,
    r: 13,
    flensHelling: 0,
    props: { iz: 1872970, welY: 190930, welZ: 34428.7, wplY: 220091, wplZ: 62196.7, avZ: 1349.54, it: 88704.7, iw: 115651e5, iRadY: 81.133, iRadZ: 25.4112 }
  },
  "UPE220": {
    kind: "Channel",
    naam: "UPE 220",
    h: 220,
    b: 85,
    tw: 6.5,
    tf: 12,
    r: 13,
    flensHelling: 0,
    props: { iz: 2464350, welY: 243855, welZ: 42507.4, wplY: 281484, wplZ: 76876.1, avZ: 1580.54, it: 120323, iw: 184412e5, iRadY: 88.9988, iRadZ: 26.9757 }
  },
  "UPE240": {
    kind: "Channel",
    naam: "UPE 240",
    h: 240,
    b: 90,
    tw: 7,
    tf: 12.5,
    r: 15,
    flensHelling: 0,
    props: { iz: 3109340, welY: 299899, welZ: 50082.1, wplY: 346889, wplZ: 90845.6, avZ: 1876.57, it: 151022, iw: 277623e5, iRadY: 96.6627, iRadZ: 28.4129 }
  },
  "UPE270": {
    kind: "Channel",
    naam: "UPE 270",
    h: 270,
    b: 95,
    tw: 7.5,
    tf: 13.5,
    r: 15,
    flensHelling: 0,
    props: { iz: 4010020, welY: 389223, welZ: 60692.6, wplY: 451088, wplZ: 110214, avZ: 2222.82, it: 198802, iw: 455401e5, iRadY: 108.251, iRadZ: 29.9045 }
  },
  "UPE300": {
    kind: "Channel",
    naam: "UPE 300",
    h: 300,
    b: 100,
    tw: 9.5,
    tf: 15,
    r: 15,
    flensHelling: 0,
    props: { iz: 5376520, welY: 521546, welZ: 75582.6, wplY: 613351, wplZ: 136714, avZ: 3029.07, it: 314750, iw: 754594e5, iRadY: 117.55, iRadZ: 30.8164 }
  },
  "UPE330": {
    kind: "Channel",
    naam: "UPE 330",
    h: 330,
    b: 105,
    tw: 11,
    tf: 16,
    r: 18,
    flensHelling: 0,
    props: { iz: 6814650, welY: 667122, welZ: 89663.5, wplY: 791892, wplZ: 161723, avZ: 3881.06, it: 451135, iw: 116336e6, iRadY: 127.445, iRadZ: 31.7103 }
  },
  "UPE360": {
    kind: "Channel",
    naam: "UPE 360",
    h: 360,
    b: 110,
    tw: 12,
    tf: 17,
    r: 18,
    flensHelling: 0,
    props: { iz: 8436980, welY: 823634, welZ: 105069, wplY: 982346, wplZ: 189247, avZ: 4561.06, it: 584003, iw: 172354e6, iRadY: 137.945, iRadZ: 32.9075 }
  },
  "UPE400": {
    kind: "Channel",
    naam: "UPE 400",
    h: 400,
    b: 115,
    tw: 13.5,
    tf: 18,
    r: 18,
    flensHelling: 0,
    props: { iz: 10447200, welY: 1049030, welZ: 122573, wplY: 1262660, wplZ: 220836, avZ: 5620.06, it: 790217, iw: 266306e6, iRadY: 151.071, iRadZ: 33.7109 }
  },
  "SHS40X40X3": {
    kind: "Shs",
    naam: "SHS 40x40x3",
    h: 40,
    b: 40,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 97750.5, welY: 4887.52, welZ: 4887.52, wplY: 5969.98, wplZ: 5969.98, avZ: 217.171, it: 156081, iw: 0, iRadY: 15.0018, iRadZ: 15.0018 }
  },
  "SHS40X40X4": {
    kind: "Shs",
    naam: "SHS 40x40x4",
    h: 40,
    b: 40,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 118295, welY: 5914.75, welZ: 5914.75, wplY: 7438.84, wplZ: 7438.84, avZ: 279.416, it: 191936, iw: 0, iRadY: 14.5493, iRadZ: 14.5493 }
  },
  "SHS40X40X5": {
    kind: "Shs",
    naam: "SHS 40x40x5",
    h: 40,
    b: 40,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 133679, welY: 6683.95, welZ: 6683.95, wplY: 8663.12, wplZ: 8663.12, avZ: 336.587, it: 219633, iw: 0, iRadY: 14.0918, iRadZ: 14.0918 }
  },
  "SHS50X50X3": {
    kind: "Shs",
    naam: "SHS 50x50x3",
    h: 50,
    b: 50,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 201989, welY: 8079.55, welZ: 8079.55, wplY: 9701.69, wplZ: 9701.69, avZ: 277.171, it: 318998, iw: 0, iRadY: 19.0886, iRadZ: 19.0886 }
  },
  "SHS50X50X4": {
    kind: "Shs",
    naam: "SHS 50x50x4",
    h: 50,
    b: 50,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 249748, welY: 9989.9, welZ: 9989.9, wplY: 12273, wplZ: 12273, avZ: 359.416, it: 400155, iw: 0, iRadY: 18.6396, iRadZ: 18.6396 }
  },
  "SHS50X50X5": {
    kind: "Shs",
    naam: "SHS 50x50x5",
    h: 50,
    b: 50,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 288806, welY: 11552.2, welZ: 11552.2, wplY: 14529, wplZ: 14529, avZ: 436.587, it: 468594, iw: 0, iRadY: 18.1866, iRadZ: 18.1866 }
  },
  "SHS50X50X63": {
    kind: "Shs",
    naam: "SHS 50x50x6.3",
    h: 50,
    b: 50,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 327622, welY: 13104.9, welZ: 13104.9, wplY: 17006.1, wplZ: 17006.1, avZ: 529.326, it: 538504, iw: 0, iRadY: 17.5918, iRadZ: 17.5918 }
  },
  "SHS60X60X3": {
    kind: "Shs",
    naam: "SHS 60x60x3",
    h: 60,
    b: 60,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 362144, welY: 12071.5, welZ: 12071.5, wplY: 14333.4, wplZ: 14333.4, avZ: 337.171, it: 567482, iw: 0, iRadY: 23.174, iRadZ: 23.174 }
  },
  "SHS60X60X4": {
    kind: "Shs",
    naam: "SHS 60x60x4",
    h: 60,
    b: 60,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 453942, welY: 15131.4, welZ: 15131.4, wplY: 18307.2, wplZ: 18307.2, avZ: 439.416, it: 720493, iw: 0, iRadY: 22.7273, iRadZ: 22.7273 }
  },
  "SHS60X60X5": {
    kind: "Shs",
    naam: "SHS 60x60x5",
    h: 60,
    b: 60,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 532592, welY: 17753.1, welZ: 17753.1, wplY: 21894.9, wplZ: 21894.9, avZ: 536.587, it: 855248, iw: 0, iRadY: 22.2773, iRadZ: 22.2773 }
  },
  "SHS60X60X63": {
    kind: "Shs",
    naam: "SHS 60x60x6.3",
    h: 60,
    b: 60,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 616453, welY: 20548.4, welZ: 20548.4, wplY: 25997.5, wplZ: 25997.5, avZ: 655.326, it: 1003030, iw: 0, iRadY: 21.6873, iRadZ: 21.6873 }
  },
  "SHS60X60X8": {
    kind: "Shs",
    naam: "SHS 60x60x8",
    h: 60,
    b: 60,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 697344, welY: 23244.8, welZ: 23244.8, wplY: 30437.5, wplZ: 30437.5, avZ: 797.664, it: 1149450, iw: 0, iRadY: 20.9073, iRadZ: 20.9073 }
  },
  "SHS70X70X36": {
    kind: "Shs",
    naam: "SHS 70x70x3.6",
    h: 70,
    b: 70,
    tw: 3.6,
    tf: 3.6,
    r: 5.4,
    props: { iz: 686485, welY: 19613.8, welZ: 19613.8, wplY: 23326.2, wplZ: 23326.2, avZ: 471.127, it: 1076950, iw: 0, iRadY: 26.9918, iRadZ: 26.9918 }
  },
  "SHS70X70X4": {
    kind: "Shs",
    naam: "SHS 70x70x4",
    h: 70,
    b: 70,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 746877, welY: 21339.4, welZ: 21339.4, wplY: 25541.3, wplZ: 25541.3, avZ: 519.416, it: 1176950, iw: 0, iRadY: 26.8134, iRadZ: 26.8134 }
  },
  "SHS70X70X5": {
    kind: "Shs",
    naam: "SHS 70x70x5",
    h: 70,
    b: 70,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 885037, welY: 25286.8, welZ: 25286.8, wplY: 30760.7, wplZ: 30760.7, avZ: 636.587, it: 1409590, iw: 0, iRadY: 26.3655, iRadZ: 26.3655 }
  },
  "SHS70X70X63": {
    kind: "Shs",
    naam: "SHS 70x70x6.3",
    h: 70,
    b: 70,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 1038480, welY: 29670.8, welZ: 29670.8, wplY: 36878.8, wplZ: 36878.8, avZ: 781.326, it: 1674810, iw: 0, iRadY: 25.7791, iRadZ: 25.7791 }
  },
  "SHS70X70X8": {
    kind: "Shs",
    naam: "SHS 70x70x8",
    h: 70,
    b: 70,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 1197550, welY: 34215.7, welZ: 34215.7, wplY: 43774.1, wplZ: 43774.1, avZ: 957.664, it: 1957960, iw: 0, iRadY: 25.0049, iRadZ: 25.0049 }
  },
  "SHS80X80X36": {
    kind: "Shs",
    naam: "SHS 80x80x3.6",
    h: 80,
    b: 80,
    tw: 3.6,
    tf: 3.6,
    r: 5.4,
    props: { iz: 1049050, welY: 26226.1, welZ: 26226.1, wplY: 30967.9, wplZ: 30967.9, avZ: 543.127, it: 1637240, iw: 0, iRadY: 31.0765, iRadZ: 31.0765 }
  },
  "SHS80X80X5": {
    kind: "Shs",
    naam: "SHS 80x80x5",
    h: 80,
    b: 80,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 1366140, welY: 34153.5, welZ: 34153.5, wplY: 41126.6, wplZ: 41126.6, avZ: 736.587, it: 2161620, iw: 0, iRadY: 30.4523, iRadZ: 30.4523 }
  },
  "SHS80X80X63": {
    kind: "Shs",
    naam: "SHS 80x80x6.3",
    h: 80,
    b: 80,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 1618900, welY: 40472.4, welZ: 40472.4, wplY: 49650.2, wplZ: 49650.2, avZ: 907.326, it: 2591650, iw: 0, iRadY: 29.8685, iRadZ: 29.8685 }
  },
  "SHS80X80X8": {
    kind: "Shs",
    naam: "SHS 80x80x8",
    h: 80,
    b: 80,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 1892720, welY: 47318, welZ: 47318, wplY: 59510.7, wplZ: 59510.7, avZ: 1117.66, it: 3070980, iw: 0, iRadY: 29.0986, iRadZ: 29.0986 }
  },
  "SHS80X80X10": {
    kind: "Shs",
    naam: "SHS 80x80x10",
    h: 80,
    b: 80,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 2138860, welY: 53471.6, welZ: 53471.6, wplY: 69304.9, wplZ: 69304.9, avZ: 1346.35, it: 3514130, iw: 0, iRadY: 28.1837, iRadZ: 28.1837 }
  },
  "SHS90X90X4": {
    kind: "Shs",
    naam: "SHS 90x90x4",
    h: 90,
    b: 90,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 1662970, welY: 36955, welZ: 36955, wplY: 43609.6, wplZ: 43609.6, avZ: 679.416, it: 2594220, iw: 0, iRadY: 34.9832, iRadZ: 34.9832 }
  },
  "SHS90X90X5": {
    kind: "Shs",
    naam: "SHS 90x90x5",
    h: 90,
    b: 90,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 1995900, welY: 44353.4, welZ: 44353.4, wplY: 52992.5, wplZ: 52992.5, avZ: 836.587, it: 3141330, iw: 0, iRadY: 34.5381, iRadZ: 34.5381 }
  },
  "SHS90X90X63": {
    kind: "Shs",
    naam: "SHS 90x90x6.3",
    h: 90,
    b: 90,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 2382910, welY: 52953.6, welZ: 52953.6, wplY: 64311.6, wplZ: 64311.6, avZ: 1033.33, it: 3791340, iw: 0, iRadY: 33.9563, iRadZ: 33.9563 }
  },
  "SHS90X90X8": {
    kind: "Shs",
    naam: "SHS 90x90x8",
    h: 90,
    b: 90,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 2814860, welY: 62552.4, welZ: 62552.4, wplY: 77647.4, wplZ: 77647.4, avZ: 1277.66, it: 4536490, iw: 0, iRadY: 33.1898, iRadZ: 33.1898 }
  },
  "SHS90X90X10": {
    kind: "Shs",
    naam: "SHS 90x90x10",
    h: 90,
    b: 90,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 3222560, welY: 71612.5, welZ: 71612.5, wplY: 91268.4, wplZ: 91268.4, avZ: 1546.35, it: 5260430, iw: 0, iRadY: 32.2799, iRadZ: 32.2799 }
  },
  "SHS100X100X4": {
    kind: "Shs",
    naam: "SHS 100x100x4",
    h: 100,
    b: 100,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 2318130, welY: 46362.7, welZ: 46362.7, wplY: 54443.8, wplZ: 54443.8, avZ: 759.416, it: 3603030, iw: 0, iRadY: 39.0674, iRadZ: 39.0674 }
  },
  "SHS100X100X63": {
    kind: "Shs",
    naam: "SHS 100x100x6.3",
    h: 100,
    b: 100,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 3355720, welY: 67114.4, welZ: 67114.4, wplY: 80862.9, wplZ: 80862.9, avZ: 1159.33, it: 5311680, iw: 0, iRadY: 38.043, iRadZ: 38.043 }
  },
  "SHS100X100X8": {
    kind: "Shs",
    naam: "SHS 100x100x8",
    h: 100,
    b: 100,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 3995960, welY: 79919.2, welZ: 79919.2, wplY: 98184, wplZ: 98184, avZ: 1437.66, it: 6402480, iw: 0, iRadY: 37.2792, iRadZ: 37.2792 }
  },
  "SHS100X100X10": {
    kind: "Shs",
    naam: "SHS 100x100x10",
    h: 100,
    b: 100,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 4620900, welY: 92418, welZ: 92418, wplY: 116232, wplZ: 116232, avZ: 1746.35, it: 7497510, iw: 0, iRadY: 36.3733, iRadZ: 36.3733 }
  },
  "SHS100X100X125": {
    kind: "Shs",
    naam: "SHS 100x100x12.5",
    h: 100,
    b: 100,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 5221830, welY: 104437, welZ: 104437, wplY: 135361, wplZ: 135361, avZ: 2103.67, it: 8579420, iw: 0, iRadY: 35.2296, iRadZ: 35.2296 }
  },
  "SHS120X120X63": {
    kind: "Shs",
    naam: "SHS 120x120x6.3",
    h: 120,
    b: 120,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 6028520, welY: 100475, welZ: 100475, wplY: 119636, wplZ: 119636, avZ: 1411.33, it: 9465510, iw: 0, iRadY: 46.2143, iRadZ: 46.2143 }
  },
  "SHS120X120X8": {
    kind: "Shs",
    naam: "SHS 120x120x8",
    h: 120,
    b: 120,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 7263070, welY: 121051, welZ: 121051, wplY: 146457, wplZ: 146457, avZ: 1757.66, it: 11527900, iw: 0, iRadY: 45.4545, iRadZ: 45.4545 }
  },
  "SHS120X120X10": {
    kind: "Shs",
    naam: "SHS 120x120x10",
    h: 120,
    b: 120,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 8521470, welY: 142025, welZ: 142025, wplY: 175159, wplZ: 175159, avZ: 2146.35, it: 13684e3, iw: 0, iRadY: 44.5546, iRadZ: 44.5546 }
  },
  "SHS120X120X125": {
    kind: "Shs",
    naam: "SHS 120x120x12.5",
    h: 120,
    b: 120,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 9817500, welY: 163625, welZ: 163625, wplY: 206810, wplZ: 206810, avZ: 2603.67, it: 15966700, iw: 0, iRadY: 43.4203, iRadZ: 43.4203 }
  },
  "SHS140X140X5": {
    kind: "Shs",
    naam: "SHS 140x140x5",
    h: 140,
    b: 140,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 8074590, welY: 115351, welZ: 115351, wplY: 134822, wplZ: 134822, avZ: 1336.59, it: 12505100, iw: 0, iRadY: 54.96, iRadZ: 54.96 }
  },
  "SHS140X140X63": {
    kind: "Shs",
    naam: "SHS 140x140x6.3",
    h: 140,
    b: 140,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 9838900, welY: 140556, welZ: 140556, wplY: 165968, wplZ: 165968, avZ: 1663.33, it: 15355500, iw: 0, iRadY: 54.3838, iRadZ: 54.3838 }
  },
  "SHS140X140X8": {
    kind: "Shs",
    naam: "SHS 140x140x8",
    h: 140,
    b: 140,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 1195e4, welY: 170715, welZ: 170715, wplY: 204331, wplZ: 204331, avZ: 2077.66, it: 18831200, iw: 0, iRadY: 53.6268, iRadZ: 53.6268 }
  },
  "SHS140X140X10": {
    kind: "Shs",
    naam: "SHS 140x140x10",
    h: 140,
    b: 140,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 14160600, welY: 202294, welZ: 202294, wplY: 246086, wplZ: 246086, avZ: 2546.35, it: 22553400, iw: 0, iRadY: 52.7311, iRadZ: 52.7311 }
  },
  "SHS140X140X125": {
    kind: "Shs",
    naam: "SHS 140x140x12.5",
    h: 140,
    b: 140,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 16529600, welY: 236138, welZ: 236138, wplY: 293258, wplZ: 293258, avZ: 3103.67, it: 26646200, iw: 0, iRadY: 51.6035, iRadZ: 51.6035 }
  },
  "SHS150X150X5": {
    kind: "Shs",
    naam: "SHS 150x150x5",
    h: 150,
    b: 150,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 10016300, welY: 133551, welZ: 133551, wplY: 155688, wplZ: 155688, avZ: 1436.59, it: 15480900, iw: 0, iRadY: 59.0436, iRadZ: 59.0436 }
  },
  "SHS150X150X63": {
    kind: "Shs",
    naam: "SHS 150x150x6.3",
    h: 150,
    b: 150,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 12233700, welY: 163116, welZ: 163116, wplY: 191970, wplZ: 191970, avZ: 1789.33, it: 19046100, iw: 0, iRadY: 58.4681, iRadZ: 58.4681 }
  },
  "SHS150X150X8": {
    kind: "Shs",
    naam: "SHS 150x150x8",
    h: 150,
    b: 150,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 14906e3, welY: 198746, welZ: 198746, wplY: 236867, wplZ: 236867, avZ: 2237.66, it: 23419600, iw: 0, iRadY: 57.7122, iRadZ: 57.7122 }
  },
  "SHS150X150X10": {
    kind: "Shs",
    naam: "SHS 150x150x10",
    h: 150,
    b: 150,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 17732100, welY: 236428, welZ: 236428, wplY: 286049, wplZ: 286049, avZ: 2746.35, it: 28144300, iw: 0, iRadY: 56.8182, iRadZ: 56.8182 }
  },
  "SHS150X150X125": {
    kind: "Shs",
    naam: "SHS 150x150x12.5",
    h: 150,
    b: 150,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 20804400, welY: 277392, welZ: 277392, wplY: 342107, wplZ: 342107, avZ: 3353.67, it: 33408100, iw: 0, iRadY: 55.6932, iRadZ: 55.6932 }
  },
  "SHS150X150X16": {
    kind: "Shs",
    naam: "SHS 150x150x16",
    h: 150,
    b: 150,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 24300200, welY: 324003, welZ: 324003, wplY: 410739, wplZ: 410739, avZ: 4150.65, it: 39574600, iw: 0, iRadY: 54.1043, iRadZ: 54.1043 }
  },
  "SHS160X160X63": {
    kind: "Shs",
    naam: "SHS 160x160x6.3",
    h: 160,
    b: 160,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 14988500, welY: 187356, welZ: 187356, wplY: 219861, wplZ: 219861, avZ: 1915.33, it: 23284100, iw: 0, iRadY: 62.5521, iRadZ: 62.5521 }
  },
  "SHS160X160X8": {
    kind: "Shs",
    naam: "SHS 160x160x8",
    h: 160,
    b: 160,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 18312900, welY: 228911, welZ: 228911, wplY: 271804, wplZ: 271804, avZ: 2397.66, it: 28696400, iw: 0, iRadY: 61.7973, iRadZ: 61.7973 }
  },
  "SHS160X160X10": {
    kind: "Shs",
    naam: "SHS 160x160x10",
    h: 160,
    b: 160,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 21858200, welY: 273228, welZ: 273228, wplY: 329013, wplZ: 329013, avZ: 2946.35, it: 34585900, iw: 0, iRadY: 60.9047, iRadZ: 60.9047 }
  },
  "SHS160X160X125": {
    kind: "Shs",
    naam: "SHS 160x160x12.5",
    h: 160,
    b: 160,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 25758200, welY: 321978, welZ: 321978, wplY: 394706, wplZ: 394706, avZ: 3603.67, it: 41218100, iw: 0, iRadY: 59.782, iRadZ: 59.782 }
  },
  "SHS160X160X16": {
    kind: "Shs",
    naam: "SHS 160x160x16",
    h: 160,
    b: 160,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 30283500, welY: 378544, welZ: 378544, wplY: 476086, wplZ: 476086, avZ: 4470.65, it: 49135700, iw: 0, iRadY: 58.1973, iRadZ: 58.1973 }
  },
  "SHS180X180X63": {
    kind: "Shs",
    naam: "SHS 180x180x6.3",
    h: 180,
    b: 180,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 21678800, welY: 240876, welZ: 240876, wplY: 281314, wplZ: 281314, avZ: 2167.33, it: 33553700, iw: 0, iRadY: 70.7197, iRadZ: 70.7197 }
  },
  "SHS180X180X8": {
    kind: "Shs",
    naam: "SHS 180x180x8",
    h: 180,
    b: 180,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 26607600, welY: 295640, welZ: 295640, wplY: 348877, wplZ: 348877, avZ: 2717.66, it: 41507500, iw: 0, iRadY: 69.9664, iRadZ: 69.9664 }
  },
  "SHS180X180X10": {
    kind: "Shs",
    naam: "SHS 180x180x10",
    h: 180,
    b: 180,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 31934400, welY: 354827, welZ: 354827, wplY: 423940, wplZ: 423940, avZ: 3346.35, it: 50261200, iw: 0, iRadY: 69.0763, iRadZ: 69.0763 }
  },
  "SHS180X180X125": {
    kind: "Shs",
    naam: "SHS 180x180x12.5",
    h: 180,
    b: 180,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 37903300, welY: 421148, welZ: 421148, wplY: 511155, wplZ: 511155, avZ: 4103.67, it: 60282e3, iw: 0, iRadY: 67.9575, iRadZ: 67.9575 }
  },
  "SHS180X180X16": {
    kind: "Shs",
    naam: "SHS 180x180x16",
    h: 180,
    b: 180,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 45037700, welY: 500419, welZ: 500419, wplY: 621179, wplZ: 621179, avZ: 5110.65, it: 72583800, iw: 0, iRadY: 66.3796, iRadZ: 66.3796 }
  },
  "SHS200X200X63": {
    kind: "Shs",
    naam: "SHS 200x200x6.3",
    h: 200,
    b: 200,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 30111500, welY: 301115, welZ: 301115, wplY: 350327, wplZ: 350327, avZ: 2419.33, it: 46466600, iw: 0, iRadY: 78.8868, iRadZ: 78.8868 }
  },
  "SHS200X200X10": {
    kind: "Shs",
    naam: "SHS 200x200x10",
    h: 200,
    b: 200,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 44709200, welY: 447092, welZ: 447092, wplY: 530867, wplZ: 530867, avZ: 3746.35, it: 70059500, iw: 0, iRadY: 77.2466, iRadZ: 77.2466 }
  },
  "SHS200X200X125": {
    kind: "Shs",
    naam: "SHS 200x200x12.5",
    h: 200,
    b: 200,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 53364900, welY: 533649, welZ: 533649, wplY: 642603, wplZ: 642603, avZ: 4603.67, it: 84438100, iw: 0, iRadY: 76.1308, iRadZ: 76.1308 }
  },
  "SHS200X200X20": {
    kind: "Shs",
    naam: "SHS 200x200x20",
    h: 200,
    b: 200,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 73934400, welY: 739344, welZ: 739344, wplY: 929855, wplZ: 929855, avZ: 6985.4, it: 11996e4, iw: 0, iRadY: 72.7466, iRadZ: 72.7466 }
  },
  "SHS220X220X8": {
    kind: "Shs",
    naam: "SHS 220x220x8",
    h: 220,
    b: 220,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 50016600, welY: 454696, welZ: 454696, wplY: 531824, wplZ: 531824, avZ: 3357.66, it: 77503200, iw: 0, iRadY: 86.3025, iRadZ: 86.3025 }
  },
  "SHS220X220X10": {
    kind: "Shs",
    naam: "SHS 220x220x10",
    h: 220,
    b: 220,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 60502400, welY: 550022, welZ: 550022, wplY: 649794, wplZ: 649794, avZ: 4146.35, it: 94460800, iw: 0, iRadY: 85.4159, iRadZ: 85.4159 }
  },
  "SHS220X220X125": {
    kind: "Shs",
    naam: "SHS 220x220x12.5",
    h: 220,
    b: 220,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 72542900, welY: 659481, welZ: 659481, wplY: 789052, wplZ: 789052, avZ: 5103.67, it: 114286e3, iw: 0, iRadY: 84.3026, iRadZ: 84.3026 }
  },
  "SHS220X220X16": {
    kind: "Shs",
    naam: "SHS 220x220x16",
    h: 220,
    b: 220,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 87488500, welY: 795350, welZ: 795350, wplY: 968965, wplZ: 968965, avZ: 6390.65, it: 139471e3, iw: 0, iRadY: 82.7347, iRadZ: 82.7347 }
  },
  "SHS250X250X63": {
    kind: "Shs",
    naam: "SHS 250x250x6.3",
    h: 250,
    b: 250,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 60139200, welY: 481114, welZ: 481114, wplY: 555933, wplZ: 555933, avZ: 3049.33, it: 92298300, iw: 0, iRadY: 99.3029, iRadZ: 99.3029 }
  },
  "SHS250X250X8": {
    kind: "Shs",
    naam: "SHS 250x250x8",
    h: 250,
    b: 250,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 74548500, welY: 596388, welZ: 596388, wplY: 694234, wplZ: 694234, avZ: 3837.66, it: 115089e3, iw: 0, iRadY: 98.5532, iRadZ: 98.5532 }
  },
  "SHS250X250X125": {
    kind: "Shs",
    naam: "SHS 250x250x12.5",
    h: 250,
    b: 250,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 109153e3, welY: 873226, welZ: 873226, wplY: 1036850, wplZ: 1036850, avZ: 5853.67, it: 171044e3, iw: 0, iRadY: 96.5582, iRadZ: 96.5582 }
  },
  "SHS250X250X16": {
    kind: "Shs",
    naam: "SHS 250x250x16",
    h: 250,
    b: 250,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 132667e3, welY: 1061340, welZ: 1061340, wplY: 1280200, wplZ: 1280200, avZ: 7350.65, it: 210153e3, iw: 0, iRadY: 94.9957, iRadZ: 94.9957 }
  },
  "SHS250X250X20": {
    kind: "Shs",
    naam: "SHS 250x250x20",
    h: 250,
    b: 250,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 156092e3, welY: 1248740, welZ: 1248740, wplY: 1534130, wplZ: 1534130, avZ: 8985.4, it: 250097e3, iw: 0, iRadY: 93.1981, iRadZ: 93.1981 }
  },
  "SHS260X260X8": {
    kind: "Shs",
    naam: "SHS 260x260x8",
    h: 260,
    b: 260,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 84225e3, welY: 647885, welZ: 647885, wplY: 753170, wplZ: 753170, avZ: 3997.66, it: 12989e4, iw: 0, iRadY: 102.637, iRadZ: 102.637 }
  },
  "SHS260X260X10": {
    kind: "Shs",
    naam: "SHS 260x260x10",
    h: 260,
    b: 260,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 102425e3, welY: 787882, welZ: 787882, wplY: 923648, wplZ: 923648, avZ: 4946.35, it: 158992e3, iw: 0, iRadY: 101.752, iRadZ: 101.752 }
  },
  "SHS260X260X125": {
    kind: "Shs",
    naam: "SHS 260x260x12.5",
    h: 260,
    b: 260,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 123648e3, welY: 951141, welZ: 951141, wplY: 1126950, wplZ: 1126950, avZ: 6103.67, it: 193459e3, iw: 0, iRadY: 100.643, iRadZ: 100.643 }
  },
  "SHS260X260X16": {
    kind: "Shs",
    naam: "SHS 260x260x16",
    h: 260,
    b: 260,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 150609e3, welY: 1158530, welZ: 1158530, wplY: 1393550, wplZ: 1393550, avZ: 7670.65, it: 238133e3, iw: 0, iRadY: 99.0819, iRadZ: 99.0819 }
  },
  "SHS300X300X8": {
    kind: "Shs",
    naam: "SHS 300x300x8",
    h: 300,
    b: 300,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 131281e3, welY: 875206, welZ: 875206, wplY: 1012920, wplZ: 1012920, avZ: 4637.66, it: 201741e3, iw: 0, iRadY: 118.97, iRadZ: 118.97 }
  },
  "SHS300X300X125": {
    kind: "Shs",
    naam: "SHS 300x300x12.5",
    h: 300,
    b: 300,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 19442e4, welY: 1296130, welZ: 1296130, wplY: 1524850, wplZ: 1524850, avZ: 7103.67, it: 3026e5, iw: 0, iRadY: 116.981, iRadZ: 116.981 }
  },
  "SHS300X300X16": {
    kind: "Shs",
    naam: "SHS 300x300x16",
    h: 300,
    b: 300,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 238496e3, welY: 1589970, welZ: 1589970, wplY: 1894940, wplZ: 1894940, avZ: 8950.65, it: 374713e3, iw: 0, iRadY: 115.424, iRadZ: 115.424 }
  },
  "SHS300X300X20": {
    kind: "Shs",
    naam: "SHS 300x300x20",
    h: 300,
    b: 300,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 283714e3, welY: 1891420, welZ: 1891420, wplY: 2288400, wplZ: 2288400, avZ: 10985.4, it: 450308e3, iw: 0, iRadY: 113.636, iRadZ: 113.636 }
  },
  "SHS350X350X8": {
    kind: "Shs",
    naam: "SHS 350x350x8",
    h: 350,
    b: 350,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 211288e3, welY: 1207360, welZ: 1207360, wplY: 1391600, wplZ: 1391600, avZ: 5437.66, it: 323605e3, iw: 0, iRadY: 139.385, iRadZ: 139.385 }
  },
  "SHS350X350X10": {
    kind: "Shs",
    naam: "SHS 350x350x10",
    h: 350,
    b: 350,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 258836e3, welY: 1479060, welZ: 1479060, wplY: 1715320, wplZ: 1715320, avZ: 6746.35, it: 398415e3, iw: 0, iRadY: 138.504, iRadZ: 138.504 }
  },
  "SHS350X350X125": {
    kind: "Shs",
    naam: "SHS 350x350x12.5",
    h: 350,
    b: 350,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 315414e3, welY: 1802360, welZ: 1802360, wplY: 2106590, wplZ: 2106590, avZ: 8353.67, it: 488482e3, iw: 0, iRadY: 137.4, iRadZ: 137.4 }
  },
  "SHS350X350X16": {
    kind: "Shs",
    naam: "SHS 350x350x16",
    h: 350,
    b: 350,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 389421e3, welY: 2225260, welZ: 2225260, wplY: 2629670, wplZ: 2629670, avZ: 10550.7, it: 60812e4, iw: 0, iRadY: 135.848, iRadZ: 135.848 }
  },
  "SHS350X350X20": {
    kind: "Shs",
    naam: "SHS 350x350x20",
    h: 350,
    b: 350,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 466798e3, welY: 2667420, welZ: 2667420, wplY: 3192670, wplZ: 3192670, avZ: 12985.4, it: 735594e3, iw: 0, iRadY: 134.067, iRadZ: 134.067 }
  },
  "SHS400X400X10": {
    kind: "Shs",
    naam: "SHS 400x400x10",
    h: 400,
    b: 400,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 391276e3, welY: 1956380, welZ: 1956380, wplY: 2260140, wplZ: 2260140, avZ: 7746.35, it: 600404e3, iw: 0, iRadY: 158.92, iRadZ: 158.92 }
  },
  "SHS400X400X125": {
    kind: "Shs",
    naam: "SHS 400x400x12.5",
    h: 400,
    b: 400,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 478386e3, welY: 2391930, welZ: 2391930, wplY: 2782090, wplZ: 2782090, avZ: 9603.67, it: 738064e3, iw: 0, iRadY: 157.818, iRadZ: 157.818 }
  },
  "SHS400X400X16": {
    kind: "Shs",
    naam: "SHS 400x400x16",
    h: 400,
    b: 400,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 593442e3, welY: 2967210, welZ: 2967210, wplY: 3484400, wplZ: 3484400, avZ: 12150.7, it: 922374e3, iw: 0, iRadY: 156.27, iRadZ: 156.27 }
  },
  "SHS400X400X20": {
    kind: "Shs",
    naam: "SHS 400x400x20",
    h: 400,
    b: 400,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 715347e3, welY: 3576730, welZ: 3576730, wplY: 4246940, wplZ: 4246940, avZ: 14985.4, it: 112095e4, iw: 0, iRadY: 154.493, iRadZ: 154.493 }
  },
  "RHS50X30X3": {
    kind: "Rhs",
    naam: "RHS 50x30x3",
    h: 50,
    b: 30,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 59389.3, welY: 5425.15, welZ: 3959.29, wplY: 6881.69, wplZ: 4758.26, avZ: 271.464, it: 133923, iw: 0, iRadY: 17.6709, iRadZ: 11.6933 }
  },
  "RHS50X30X32": {
    kind: "Rhs",
    naam: "RHS 50x30x3.2",
    h: 50,
    b: 30,
    tw: 3.2,
    tf: 3.2,
    r: 4.800000000000001,
    props: { iz: 61973.3, welY: 5682.82, welZ: 4131.55, wplY: 7246.44, wplZ: 5001.12, avZ: 287.533, it: 140362, iw: 0, iRadY: 17.5731, iRadZ: 11.6064 }
  },
  "RHS50X30X4": {
    kind: "Rhs",
    naam: "RHS 50x30x4",
    h: 50,
    b: 30,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 70837.4, welY: 6595.77, welZ: 4722.49, wplY: 8593, wplZ: 5884.68, avZ: 349.27, it: 162999, iw: 0, iRadY: 17.1776, iRadZ: 11.2588 }
  },
  "RHS50X30X5": {
    kind: "Rhs",
    naam: "RHS 50x30x5",
    h: 50,
    b: 30,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 78877.1, welY: 7485.58, welZ: 5258.48, wplY: 10029, wplZ: 6797.24, avZ: 420.734, it: 184313, iw: 0, iRadY: 16.6732, iRadZ: 10.8246 }
  },
  "RHS60X40X3": {
    kind: "Rhs",
    naam: "RHS 60x40x3",
    h: 60,
    b: 40,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 138910, welY: 8819.48, welZ: 6945.52, wplY: 10913.4, wplZ: 8189.98, avZ: 332.606, it: 290619, iw: 0, iRadY: 21.847, iRadZ: 15.8299 }
  },
  "RHS60X40X32": {
    kind: "Rhs",
    naam: "RHS 60x40x3.2",
    h: 60,
    b: 40,
    tw: 3.2,
    tf: 3.2,
    r: 4.800000000000001,
    props: { iz: 145742, welY: 9274.8, welZ: 7287.08, wplY: 11524.3, wplZ: 8638.98, avZ: 352.831, it: 306056, iw: 0, iRadY: 21.7523, iRadZ: 15.7429 }
  },
  "RHS60X40X4": {
    kind: "Rhs",
    naam: "RHS 60x40x4",
    h: 60,
    b: 40,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 170348, welY: 10942.9, welZ: 8517.42, wplY: 13827.2, wplZ: 10318.8, avZ: 431.299, it: 362858, iw: 0, iRadY: 21.3705, iRadZ: 15.3941 }
  },
  "RHS60X40X5": {
    kind: "Rhs",
    naam: "RHS 60x40x5",
    h: 60,
    b: 40,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 195346, welY: 12697.5, welZ: 9767.28, wplY: 16394.9, wplZ: 12163.1, avZ: 523.905, it: 422716, iw: 0, iRadY: 20.8867, iRadZ: 14.9572 }
  },
  "RHS60X40X63": {
    kind: "Rhs",
    naam: "RHS 60x40x6.3",
    h: 60,
    b: 40,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 219168, welY: 14464.9, welZ: 10958.4, wplY: 19231.3, wplZ: 14151, avZ: 635.191, it: 482052, iw: 0, iRadY: 20.2461, iRadZ: 14.3884 }
  },
  "RHS70X50X3": {
    kind: "Rhs",
    naam: "RHS 70x50x3",
    h: 70,
    b: 50,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 268349, welY: 13013.1, welZ: 10734, wplY: 15845.1, wplZ: 12521.7, avZ: 393.367, it: 532961, iw: 0, iRadY: 25.9886, iRadZ: 19.9485 }
  },
  "RHS70X50X36": {
    kind: "Rhs",
    naam: "RHS 70x50x3.6",
    h: 70,
    b: 50,
    tw: 3.6,
    tf: 3.6,
    r: 5.4,
    props: { iz: 309386, welY: 15074.5, welZ: 12375.4, wplY: 18545.4, wplZ: 14623.7, avZ: 465.648, it: 620318, iw: 0, iRadY: 25.709, iRadZ: 19.687 }
  },
  "RHS70X50X4": {
    kind: "Rhs",
    naam: "RHS 70x50x4",
    h: 70,
    b: 50,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 334601, welY: 16355, welZ: 13384, wplY: 20261.3, wplZ: 15953, avZ: 512.652, it: 674970, iw: 0, iRadY: 25.5215, iRadZ: 19.5124 }
  },
  "RHS70X50X5": {
    kind: "Rhs",
    naam: "RHS 70x50x5",
    h: 70,
    b: 50,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 390473, welY: 19239.1, welZ: 15618.9, wplY: 24260.7, wplZ: 19029, avZ: 626.019, it: 799025, iw: 0, iRadY: 25.0491, iRadZ: 19.0748 }
  },
  "RHS70X50X63": {
    kind: "Rhs",
    naam: "RHS 70x50x6.3",
    h: 70,
    b: 50,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 448766, welY: 22343.1, welZ: 17950.6, wplY: 28852.6, wplZ: 22512.3, avZ: 764.547, it: 933404, iw: 0, iRadY: 24.4266, iRadZ: 18.504 }
  },
  "RHS80X40X3": {
    kind: "Rhs",
    naam: "RHS 80x40x3",
    h: 80,
    b: 40,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 180070, welY: 13557.2, welZ: 9003.52, wplY: 17056.8, wplZ: 10410, avZ: 449.562, it: 435896, iw: 0, iRadY: 28.3579, iRadZ: 16.3411 }
  },
  "RHS80X40X32": {
    kind: "Rhs",
    naam: "RHS 80x40x3.2",
    h: 80,
    b: 40,
    tw: 3.2,
    tf: 3.2,
    r: 4.800000000000001,
    props: { iz: 189186, welY: 14295, welZ: 9459.32, wplY: 18044.8, wplZ: 10994.2, avZ: 477.368, it: 459534, iw: 0, iRadY: 28.2586, iRadZ: 16.2545 }
  },
  "RHS80X40X4": {
    kind: "Rhs",
    naam: "RHS 80x40x4",
    h: 80,
    b: 40,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 222402, welY: 17051.2, welZ: 11120.1, wplY: 21815.5, wplZ: 13198.8, avZ: 585.888, it: 547312, iw: 0, iRadY: 27.8583, iRadZ: 15.908 }
  },
  "RHS80X40X5": {
    kind: "Rhs",
    naam: "RHS 80x40x5",
    h: 80,
    b: 40,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 257012, welY: 20070.2, welZ: 12850.6, wplY: 26126.6, wplZ: 15663.1, avZ: 715.45, it: 641823, iw: 0, iRadY: 27.3508, iRadZ: 15.4754 }
  },
  "RHS80X40X63": {
    kind: "Rhs",
    naam: "RHS 80x40x6.3",
    h: 80,
    b: 40,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 291550, welY: 23320.9, welZ: 14577.5, wplY: 31077.8, wplZ: 18397.2, avZ: 873.768, it: 739563, iw: 0, iRadY: 26.6784, iRadZ: 14.9146 }
  },
  "RHS80X40X8": {
    kind: "Rhs",
    naam: "RHS 80x40x8",
    h: 80,
    b: 40,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 321088, welY: 26496.7, welZ: 16054.4, wplY: 36470.7, wplZ: 21204.2, avZ: 1063.55, it: 825058, iw: 0, iRadY: 25.7751, iRadZ: 14.1869 }
  },
  "RHS90X50X36": {
    kind: "Rhs",
    naam: "RHS 90x50x3.6",
    h: 90,
    b: 50,
    tw: 3.6,
    tf: 3.6,
    r: 5.4,
    props: { iz: 387048, welY: 21847.5, welZ: 15481.9, wplY: 27247.9, wplZ: 17964.5, avZ: 605.735, it: 889700, iw: 0, iRadY: 32.3016, iRadZ: 20.2674 }
  },
  "RHS90X50X4": {
    kind: "Rhs",
    naam: "RHS 90x50x4",
    h: 90,
    b: 50,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 419454, welY: 23797, welZ: 16778.2, wplY: 29849.6, wplZ: 19633, avZ: 667.82, it: 969750, iw: 0, iRadY: 32.1067, iRadZ: 20.0942 }
  },
  "RHS90X50X5": {
    kind: "Rhs",
    naam: "RHS 90x50x5",
    h: 90,
    b: 50,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 492139, welY: 28279.3, welZ: 19685.6, wplY: 35992.5, wplZ: 23529, avZ: 818.469, it: 1153390, iw: 0, iRadY: 31.6153, iRadZ: 19.6608 }
  },
  "RHS90X50X63": {
    kind: "Rhs",
    naam: "RHS 90x50x6.3",
    h: 90,
    b: 50,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 569910, welY: 33300.6, welZ: 22796.4, wplY: 43219.2, wplZ: 28018.5, avZ: 1004.56, it: 1356930, iw: 0, iRadY: 30.9672, iRadZ: 19.0973 }
  },
  "RHS90X50X8": {
    kind: "Rhs",
    naam: "RHS 90x50x8",
    h: 90,
    b: 50,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 645759, welY: 38569, welZ: 25830.4, wplY: 51407.4, wplZ: 32940.8, avZ: 1231.28, it: 1563350, iw: 0, iRadY: 30.1026, iRadZ: 18.3617 }
  },
  "RHS100X50X3": {
    kind: "Rhs",
    naam: "RHS 100x50x3",
    h: 100,
    b: 50,
    tw: 3,
    tf: 3,
    r: 4.5,
    props: { iz: 367889, welY: 21920.8, welZ: 14715.6, wplY: 27310.3, wplZ: 16751.7, avZ: 569.562, it: 881137, iw: 0, iRadY: 35.8176, iRadZ: 20.7512 }
  },
  "RHS100X50X32": {
    kind: "Rhs",
    naam: "RHS 100x50x3.2",
    h: 100,
    b: 50,
    tw: 3.2,
    tf: 3.2,
    r: 4.800000000000001,
    props: { iz: 387760, welY: 23171, welZ: 15510.4, wplY: 28942.9, wplZ: 17729.6, avZ: 605.368, it: 931411, iw: 0, iRadY: 35.7192, iRadZ: 20.6645 }
  },
  "RHS100X50X5": {
    kind: "Rhs",
    naam: "RHS 100x50x5",
    h: 100,
    b: 50,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 542973, welY: 33303.1, welZ: 21718.9, wplY: 42608.4, wplZ: 25779, avZ: 915.45, it: 1336210, iw: 0, iRadY: 34.8229, iRadZ: 19.885 }
  },
  "RHS100X50X63": {
    kind: "Rhs",
    naam: "RHS 100x50x6.3",
    h: 100,
    b: 50,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 630482, welY: 39416.7, welZ: 25219.3, wplY: 51347.4, wplZ: 30771.6, avZ: 1125.77, it: 1575320, iw: 0, iRadY: 34.1629, iRadZ: 19.3226 }
  },
  "RHS100X50X8": {
    kind: "Rhs",
    naam: "RHS 100x50x8",
    h: 100,
    b: 50,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 717173, welY: 45977.9, welZ: 28686.9, wplY: 61384, wplZ: 36300.8, avZ: 1383.55, it: 1821070, iw: 0, iRadY: 33.2825, iRadZ: 18.5895 }
  },
  "RHS100X60X36": {
    kind: "Rhs",
    naam: "RHS 100x60x3.6",
    h: 100,
    b: 60,
    tw: 3.6,
    tf: 3.6,
    r: 5.4,
    props: { iz: 648184, welY: 28942.5, welZ: 21606.1, wplY: 35609.6, wplZ: 24886.1, avZ: 678.909, it: 1419910, iw: 0, iRadY: 36.4996, iRadZ: 24.4278 }
  },
  "RHS100X60X4": {
    kind: "Rhs",
    naam: "RHS 100x60x4",
    h: 100,
    b: 60,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 705248, welY: 31608.6, welZ: 23508.3, wplY: 39083.8, wplZ: 27267.2, avZ: 749.27, it: 1552850, iw: 0, iRadY: 36.3085, iRadZ: 24.2545 }
  },
  "RHS100X60X5": {
    kind: "Rhs",
    naam: "RHS 100x60x5",
    h: 100,
    b: 60,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 835925, welY: 37819.8, welZ: 27864.2, wplY: 47358.4, wplZ: 32894.9, avZ: 920.734, it: 1863400, iw: 0, iRadY: 35.8276, iRadZ: 23.8208 }
  },
  "RHS100X60X63": {
    kind: "Rhs",
    naam: "RHS 100x60x6.3",
    h: 100,
    b: 60,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 981465, welY: 44956.3, welZ: 32715.5, wplY: 57250.5, wplZ: 39529.9, avZ: 1134.16, it: 2220500, iw: 0, iRadY: 35.1952, iRadZ: 23.2563 }
  },
  "RHS100X60X8": {
    kind: "Rhs",
    naam: "RHS 100x60x8",
    h: 100,
    b: 60,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 1133400, welY: 52766.2, welZ: 37779.9, wplY: 68744, wplZ: 47077.5, avZ: 1397.08, it: 2607990, iw: 0, iRadY: 34.3552, iRadZ: 22.5175 }
  },
  "RHS120X60X36": {
    kind: "Rhs",
    naam: "RHS 120x60x3.6",
    h: 120,
    b: 60,
    tw: 3.6,
    tf: 3.6,
    r: 5.4,
    props: { iz: 762854, welY: 37879.1, welZ: 25428.5, wplY: 47192.1, wplZ: 28946.9, avZ: 820.169, it: 1827130, iw: 0, iRadY: 42.9811, iRadZ: 24.9014 }
  },
  "RHS120X60X4": {
    kind: "Rhs",
    naam: "RHS 120x60x4",
    h: 120,
    b: 60,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 830902, welY: 41455.3, welZ: 27696.7, wplY: 51872.1, wplZ: 31747.2, avZ: 905.888, it: 1999650, iw: 0, iRadY: 42.7842, iRadZ: 24.7282 }
  },
  "RHS120X60X63": {
    kind: "Rhs",
    naam: "RHS 120x60x6.3",
    h: 120,
    b: 60,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 1163970, welY: 59711.5, welZ: 38799, wplY: 76657.1, wplZ: 46296.1, avZ: 1377.77, it: 2873290, iw: 0, iRadY: 41.6362, iRadZ: 23.7322 }
  },
  "RHS120X60X8": {
    kind: "Rhs",
    naam: "RHS 120x60x8",
    h: 120,
    b: 60,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 1351420, welY: 70789.8, welZ: 45047.5, wplY: 92697.3, wplZ: 55397.5, avZ: 1703.55, it: 3389770, iw: 0, iRadY: 40.7697, iRadZ: 22.9971 }
  },
  "RHS120X60X10": {
    kind: "Rhs",
    naam: "RHS 120x60x10",
    h: 120,
    b: 60,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 1515370, welY: 81357.9, welZ: 50512.2, wplY: 109159, wplZ: 64377.9, avZ: 2061.8, it: 3857790, iw: 0, iRadY: 39.7289, iRadZ: 22.1355 }
  },
  "RHS120X80X4": {
    kind: "Rhs",
    naam: "RHS 120x80x4",
    h: 120,
    b: 80,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 1607060, welY: 50429.6, welZ: 40176.5, wplY: 61152.1, wplZ: 46135.5, avZ: 911.299, it: 3296350, iw: 0, iRadY: 44.6337, iRadZ: 32.5283 }
  },
  "RHS120X80X5": {
    kind: "Rhs",
    naam: "RHS 120x80x5",
    h: 120,
    b: 80,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 1929470, welY: 60896.8, welZ: 48236.8, wplY: 74590.1, wplZ: 56126.6, avZ: 1123.9, it: 3997800, iw: 0, iRadY: 44.1656, iRadZ: 32.0945 }
  },
  "RHS120X80X63": {
    kind: "Rhs",
    naam: "RHS 120x80x6.3",
    h: 120,
    b: 80,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 2304960, welY: 73299.5, welZ: 57623.9, wplY: 90983.3, wplZ: 68222.6, avZ: 1391.19, it: 4835890, iw: 0, iRadY: 43.552, iRadZ: 31.5293 }
  },
  "RHS120X80X8": {
    kind: "Rhs",
    naam: "RHS 120x80x8",
    h: 120,
    b: 80,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 2725570, welY: 87543.6, welZ: 68139.3, wplY: 110617, wplZ: 82550.7, avZ: 1725.2, it: 5805720, iw: 0, iRadY: 42.7409, iRadZ: 30.7883 }
  },
  "RHS120X80X10": {
    kind: "Rhs",
    naam: "RHS 120x80x10",
    h: 120,
    b: 80,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 3125530, welY: 101580, welZ: 78138.2, wplY: 131159, wplZ: 97304.9, avZ: 2095.62, it: 6763450, iw: 0, iRadY: 41.7734, iRadZ: 29.9145 }
  },
  "RHS140X80X4": {
    kind: "Rhs",
    naam: "RHS 140x80x4",
    h: 140,
    b: 80,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 1838310, welY: 62943.3, welZ: 45957.9, wplY: 77140.4, wplZ: 52215.5, avZ: 1068.35, it: 4097670, iw: 0, iRadY: 51.2295, iRadZ: 33.0907 }
  },
  "RHS140X80X5": {
    kind: "Rhs",
    naam: "RHS 140x80x5",
    h: 140,
    b: 80,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 2211140, welY: 76279.9, welZ: 55278.5, wplY: 94321.9, wplZ: 63626.6, avZ: 1319.29, it: 4976560, iw: 0, iRadY: 50.75, iRadZ: 32.658 }
  },
  "RHS140X80X63": {
    kind: "Rhs",
    naam: "RHS 140x80x6.3",
    h: 140,
    b: 80,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 2647990, welY: 92255.7, welZ: 66199.7, wplY: 115430, wplZ: 77508.8, avZ: 1635.87, it: 6031780, iw: 0, iRadY: 50.1215, iRadZ: 32.0949 }
  },
  "RHS140X80X8": {
    kind: "Rhs",
    naam: "RHS 140x80x8",
    h: 140,
    b: 80,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 3142e3, welY: 110902, welZ: 78550, wplY: 140971, wplZ: 94070.7, avZ: 2033.39, it: 7262600, iw: 0, iRadY: 49.2903, iRadZ: 31.3578 }
  },
  "RHS140X80X10": {
    kind: "Rhs",
    naam: "RHS 140x80x10",
    h: 140,
    b: 80,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 3618860, welY: 129723, welZ: 90471.6, wplY: 168086, wplZ: 111305, avZ: 2477.17, it: 8494420, iw: 0, iRadY: 48.2983, iRadZ: 30.4902 }
  },
  "RHS150X100X4": {
    kind: "Rhs",
    naam: "RHS 150x100x4",
    h: 150,
    b: 100,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 3240270, welY: 80972.4, welZ: 64805.4, wplY: 97414.6, wplZ: 73643.8, avZ: 1151.3, it: 6591180, iw: 0, iRadY: 56.2575, iRadZ: 41.0934 }
  },
  "RHS150X100X5": {
    kind: "Rhs",
    naam: "RHS 150x100x5",
    h: 150,
    b: 100,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 3923490, welY: 98495.2, welZ: 78469.8, wplY: 119438, wplZ: 90108.4, avZ: 1423.9, it: 8047730, iw: 0, iRadY: 55.7922, iRadZ: 40.6604 }
  },
  "RHS150X100X63": {
    kind: "Rhs",
    naam: "RHS 150x100x6.3",
    h: 150,
    b: 100,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 4740610, welY: 119724, welZ: 94812.1, wplY: 146704, wplZ: 110378, avZ: 1769.19, it: 9826250, iw: 0, iRadY: 55.1835, iRadZ: 40.0964 }
  },
  "RHS150X100X8": {
    kind: "Rhs",
    naam: "RHS 150x100x8",
    h: 150,
    b: 100,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 5693030, welY: 144919, welZ: 113861, wplY: 180067, wplZ: 134984, avZ: 2205.2, it: 11955300, iw: 0, iRadY: 54.3807, iRadZ: 39.3571 }
  },
  "RHS150X100X10": {
    kind: "Rhs",
    naam: "RHS 150x100x10",
    h: 150,
    b: 100,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 6654230, welY: 170984, welZ: 133085, wplY: 216049, wplZ: 161232, avZ: 2695.62, it: 14174100, iw: 0, iRadY: 53.4262, iRadZ: 38.4853 }
  },
  "RHS150X100X125": {
    kind: "Rhs",
    naam: "RHS 150x100x12.5",
    h: 150,
    b: 100,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 7630690, welY: 198399, welZ: 152614, wplY: 256170, wplZ: 190049, avZ: 3274.41, it: 16512300, iw: 0, iRadY: 52.2167, iRadZ: 37.3931 }
  },
  "RHS160X80X4": {
    kind: "Rhs",
    naam: "RHS 160x80x4",
    h: 160,
    b: 80,
    tw: 4,
    tf: 4,
    r: 6,
    props: { iz: 2069570, welY: 76525.7, welZ: 51739.2, wplY: 94728.8, wplZ: 58295.5, avZ: 1225.89, it: 4920560, iw: 0, iRadY: 57.7003, iRadZ: 33.5482 }
  },
  "RHS160X80X5": {
    kind: "Rhs",
    naam: "RHS 160x80x5",
    h: 160,
    b: 80,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 2492810, welY: 93000.2, welZ: 62320.2, wplY: 116054, wplZ: 71126.6, avZ: 1515.45, it: 5981360, iw: 0, iRadY: 57.2098, iRadZ: 33.1152 }
  },
  "RHS160X80X63": {
    kind: "Rhs",
    naam: "RHS 160x80x6.3",
    h: 160,
    b: 80,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 2991020, welY: 112899, welZ: 74775.4, wplY: 142396, wplZ: 86795, avZ: 1881.77, it: 7259010, iw: 0, iRadY: 56.5669, iRadZ: 32.5522 }
  },
  "RHS160X80X8": {
    kind: "Rhs",
    naam: "RHS 160x80x8",
    h: 160,
    b: 80,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 3558430, welY: 136410, welZ: 88960.7, wplY: 174524, wplZ: 105591, avZ: 2343.55, it: 8756980, iw: 0, iRadY: 55.7166, iRadZ: 31.816 }
  },
  "RHS160X80X10": {
    kind: "Rhs",
    naam: "RHS 160x80x10",
    h: 160,
    b: 80,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 4112200, welY: 160561, welZ: 102805, wplY: 209013, wplZ: 125305, avZ: 2861.8, it: 10269200, iw: 0, iRadY: 54.7016, iRadZ: 30.9508 }
  },
  "RHS160X80X125": {
    kind: "Rhs",
    naam: "RHS 160x80x12.5",
    h: 160,
    b: 80,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 4646800, welY: 185676, welZ: 116170, wplY: 247206, wplZ: 146413, avZ: 3471.56, it: 11781200, iw: 0, iRadY: 53.409, iRadZ: 29.8723 }
  },
  "RHS180X100X5": {
    kind: "Rhs",
    naam: "RHS 180x100x5",
    h: 180,
    b: 100,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 4600990, welY: 128075, welZ: 92019.8, wplY: 157285, wplZ: 104358, avZ: 1718.47, it: 10402100, iw: 0, iRadY: 65.6658, iRadZ: 41.487 }
  },
  "RHS180X100X63": {
    kind: "Rhs",
    naam: "RHS 180x100x6.3",
    h: 180,
    b: 100,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 5571540, welY: 156358, welZ: 111431, wplY: 193769, wplZ: 128088, avZ: 2138.56, it: 12722200, iw: 0, iRadY: 65.0395, iRadZ: 40.9245 }
  },
  "RHS180X100X8": {
    kind: "Rhs",
    naam: "RHS 180x100x8",
    h: 180,
    b: 100,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 6711270, welY: 190376, welZ: 134225, wplY: 238797, wplZ: 157064, avZ: 2671.28, it: 15516e3, iw: 0, iRadY: 64.2133, iRadZ: 40.1883 }
  },
  "RHS180X100X10": {
    kind: "Rhs",
    naam: "RHS 180x100x10",
    h: 180,
    b: 100,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 7874230, welY: 226234, welZ: 157485, wplY: 287940, wplZ: 188232, avZ: 3273.88, it: 18454200, iw: 0, iRadY: 63.2305, iRadZ: 39.3215 }
  },
  "RHS180X100X125": {
    kind: "Rhs",
    naam: "RHS 180x100x12.5",
    h: 180,
    b: 100,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 9076e3, welY: 264990, welZ: 181520, wplY: 343655, wplZ: 222861, avZ: 3990.43, it: 21597400, iw: 0, iRadY: 61.9846, iRadZ: 38.2379 }
  },
  "RHS200X100X5": {
    kind: "Rhs",
    naam: "RHS 200x100x5",
    h: 200,
    b: 100,
    tw: 5,
    tf: 5,
    r: 7.5,
    props: { iz: 5052660, welY: 149464, welZ: 101053, wplY: 185017, wplZ: 113858, avZ: 1915.45, it: 12013100, iw: 0, iRadY: 72.1253, iRadZ: 41.9352 }
  },
  "RHS200X100X63": {
    kind: "Rhs",
    naam: "RHS 200x100x6.3",
    h: 200,
    b: 100,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 6125490, welY: 182886, welZ: 122510, wplY: 228296, wplZ: 139894, avZ: 2385.77, it: 14703100, iw: 0, iRadY: 71.4876, iRadZ: 41.3724 }
  },
  "RHS200X100X10": {
    kind: "Rhs",
    naam: "RHS 200x100x10",
    h: 200,
    b: 100,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 8687560, welY: 266425, welZ: 173751, wplY: 340867, wplZ: 206232, avZ: 3661.8, it: 21379400, iw: 0, iRadY: 69.6458, iRadZ: 39.77 }
  },
  "RHS200X100X125": {
    kind: "Rhs",
    naam: "RHS 200x100x12.5",
    h: 200,
    b: 100,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 10039500, welY: 313596, welZ: 200791, wplY: 408228, wplZ: 244736, avZ: 4471.56, it: 25071200, iw: 0, iRadY: 68.377, iRadZ: 38.6885 }
  },
  "RHS200X100X16": {
    kind: "Rhs",
    naam: "RHS 200x100x16",
    h: 200,
    b: 100,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 11474800, welY: 367823, welZ: 229495, wplY: 491072, wplZ: 290407, avZ: 5534.21, it: 29137200, iw: 0, iRadY: 66.565, iRadZ: 37.1791 }
  },
  "RHS200X120X63": {
    kind: "Rhs",
    naam: "RHS 200x120x6.3",
    h: 200,
    b: 120,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 9289630, welY: 206532, welZ: 154827, wplY: 252702, wplZ: 176940, avZ: 2394.16, it: 20230300, iw: 0, iRadY: 73.4273, iRadZ: 49.2451 }
  },
  "RHS200X120X8": {
    kind: "Rhs",
    naam: "RHS 200x120x8",
    h: 200,
    b: 120,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 11284e3, welY: 252868, welZ: 188066, wplY: 312670, wplZ: 218137, avZ: 2997.08, it: 24845700, iw: 0, iRadY: 72.617, iRadZ: 48.509 }
  },
  "RHS200X120X10": {
    kind: "Rhs",
    naam: "RHS 200x120x10",
    h: 200,
    b: 120,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 13374800, welY: 302558, welZ: 222913, wplY: 378867, wplZ: 263159, avZ: 3682.94, it: 29814500, iw: 0, iRadY: 71.6552, iRadZ: 47.6416 }
  },
  "RHS200X120X125": {
    kind: "Rhs",
    naam: "RHS 200x120x12.5",
    h: 200,
    b: 120,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 15621700, welY: 357607, welZ: 260361, wplY: 455103, wplZ: 314310, avZ: 4504.59, it: 35323800, iw: 0, iRadY: 70.4394, iRadZ: 46.556 }
  },
  "RHS250X150X63": {
    kind: "Rhs",
    naam: "RHS 250x150x6.3",
    h: 250,
    b: 150,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 18742500, welY: 331418, welZ: 249900, wplY: 402402, wplZ: 282501, avZ: 3024.16, it: 40472400, iw: 0, iRadY: 92.5297, iRadZ: 62.2374 }
  },
  "RHS250X150X10": {
    kind: "Rhs",
    naam: "RHS 250x150x10",
    h: 250,
    b: 150,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 27548800, welY: 493884, welZ: 367317, wplY: 610684, wplZ: 426049, avZ: 4682.94, it: 60658300, iw: 0, iRadY: 90.7712, iRadZ: 60.6362 }
  },
  "RHS250X150X125": {
    kind: "Rhs",
    naam: "RHS 250x150x12.5",
    h: 250,
    b: 150,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 32653300, welY: 590934, welZ: 435378, wplY: 739974, wplZ: 513982, avZ: 5754.59, it: 72789200, iw: 0, iRadY: 89.5689, iRadZ: 59.552 }
  },
  "RHS250X150X16": {
    kind: "Rhs",
    naam: "RHS 250x150x16",
    h: 250,
    b: 150,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 38733300, welY: 710353, welZ: 516444, wplY: 905805, wplZ: 625139, avZ: 7188.32, it: 87726e3, iw: 0, iRadY: 87.8655, iRadZ: 58.0321 }
  },
  "RHS260X180X8": {
    kind: "Rhs",
    naam: "RHS 260x180x8",
    h: 260,
    b: 180,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 36081300, welY: 491515, welZ: 400903, wplY: 591890, wplZ: 458957, avZ: 3968.15, it: 72073100, iw: 0, iRadY: 97.5453, iRadZ: 73.3006 }
  },
  "RHS260X180X10": {
    kind: "Rhs",
    naam: "RHS 260x180x10",
    h: 260,
    b: 180,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 43507800, welY: 595471, welZ: 483420, wplY: 723648, wplZ: 559940, avZ: 4900.23, it: 87710700, iw: 0, iRadY: 96.6171, iRadZ: 72.4328 }
  },
  "RHS260X180X125": {
    kind: "Rhs",
    naam: "RHS 260x180x12.5",
    h: 260,
    b: 180,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 51957500, welY: 715339, welZ: 577305, wplY: 879449, wplZ: 678655, avZ: 6031.61, it: 10591e4, iw: 0, iRadY: 95.449, iRadZ: 71.3457 }
  },
  "RHS260X180X16": {
    kind: "Rhs",
    naam: "RHS 260x180x16",
    h: 260,
    b: 180,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 62305800, welY: 865011, welZ: 692286, wplY: 1081230, wplZ: 831099, avZ: 7552.59, it: 128867e3, iw: 0, iRadY: 93.7983, iRadZ: 69.8195 }
  },
  "RHS300X200X63": {
    kind: "Rhs",
    naam: "RHS 300x200x6.3",
    h: 300,
    b: 200,
    tw: 6.3,
    tf: 6.3,
    r: 9.45,
    props: { iz: 41934400, welY: 521939, welZ: 419344, wplY: 623759, wplZ: 472358, avZ: 3659.19, it: 84684600, iw: 0, iRadY: 113.302, iRadZ: 82.9217 }
  },
  "RHS300X200X8": {
    kind: "Rhs",
    naam: "RHS 300x200x8",
    h: 300,
    b: 200,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 51844300, welY: 647779, welZ: 518443, wplY: 779317, wplZ: 589150, avZ: 4605.2, it: 105459e3, iw: 0, iRadY: 112.515, iRadZ: 82.1868 }
  },
  "RHS300X200X125": {
    kind: "Rhs",
    naam: "RHS 300x200x12.5",
    h: 300,
    b: 200,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 75370100, welY: 951512, welZ: 753701, wplY: 1165470, wplZ: 876978, avZ: 7024.41, it: 156164e3, iw: 0, iRadY: 110.414, iRadZ: 80.2362 }
  },
  "RHS300X200X16": {
    kind: "Rhs",
    naam: "RHS 300x200x16",
    h: 300,
    b: 200,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 91088400, welY: 1159350, welZ: 910884, wplY: 1440540, wplZ: 1079870, avZ: 8820.79, it: 191285e3, iw: 0, iRadY: 108.761, iRadZ: 78.7143 }
  },
  "RHS350X250X8": {
    kind: "Rhs",
    naam: "RHS 350x250x8",
    h: 350,
    b: 250,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 97982600, welY: 939963, welZ: 783861, wplY: 1118e3, wplZ: 887834, avZ: 5410.61, it: 190073e3, iw: 0, iRadY: 133.171, iRadZ: 102.78 }
  },
  "RHS350X250X10": {
    kind: "Rhs",
    naam: "RHS 350x250x10",
    h: 350,
    b: 250,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 119369e3, welY: 1148680, welZ: 954950, wplY: 1375320, wplZ: 1090680, avZ: 6704.07, it: 233165e3, iw: 0, iRadY: 132.254, iRadZ: 101.914 }
  },
  "RHS350X250X125": {
    kind: "Rhs",
    naam: "RHS 350x250x12.5",
    h: 350,
    b: 250,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 14444e4, welY: 1395370, welZ: 1155520, wplY: 1684720, wplZ: 1333720, avZ: 8287.62, it: 284527e3, iw: 0, iRadY: 131.101, iRadZ: 100.829 }
  },
  "RHS350X250X16": {
    kind: "Rhs",
    naam: "RHS 350x250x16",
    h: 350,
    b: 250,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 17654e4, welY: 1714900, welZ: 1412320, wplY: 2095270, wplZ: 1654600, avZ: 10442.4, it: 351748e3, iw: 0, iRadY: 129.478, iRadZ: 99.3069 }
  },
  "RHS400X200X8": {
    kind: "Rhs",
    naam: "RHS 400x200x8",
    h: 400,
    b: 200,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 66598400, welY: 978101, welZ: 665984, wplY: 1203080, wplZ: 742750, avZ: 6183.55, it: 157153e3, iw: 0, iRadY: 145.225, iRadZ: 84.7359 }
  },
  "RHS400X200X10": {
    kind: "Rhs",
    naam: "RHS 400x200x10",
    h: 400,
    b: 200,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 80842500, welY: 1195710, welZ: 808425, wplY: 1480140, wplZ: 910867, avZ: 7661.8, it: 192209e3, iw: 0, iRadY: 144.251, iRadZ: 83.8704 }
  },
  "RHS400X200X125": {
    kind: "Rhs",
    naam: "RHS 400x200x12.5",
    h: 400,
    b: 200,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 97375300, welY: 1453130, welZ: 973753, wplY: 1813340, wplZ: 1111350, avZ: 9471.56, it: 233647e3, iw: 0, iRadY: 143.025, iRadZ: 82.7881 }
  },
  "RHS400X200X16": {
    kind: "Rhs",
    naam: "RHS 400x200x16",
    h: 400,
    b: 200,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 118242e3, welY: 1786880, welZ: 1182420, wplY: 2255600, wplZ: 1374270, avZ: 11934.2, it: 287209e3, iw: 0, iRadY: 141.293, iRadZ: 81.2723 }
  },
  "RHS400X200X20": {
    kind: "Rhs",
    naam: "RHS 400x200x20",
    h: 400,
    b: 200,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 139001e3, welY: 2131400, welZ: 1390010, wplY: 2726940, wplZ: 1649860, avZ: 14647.2, it: 34207e4, iw: 0, iRadY: 139.292, iRadZ: 79.5401 }
  },
  "RHS450X250X8": {
    kind: "Rhs",
    naam: "RHS 450x250x8",
    h: 450,
    b: 250,
    tw: 8,
    tf: 8,
    r: 12,
    props: { iz: 121417e3, welY: 1336960, welZ: 971334, wplY: 1621770, wplZ: 1081430, avZ: 6991.28, it: 270599e3, iw: 0, iRadY: 166.314, iRadZ: 105.662 }
  },
  "RHS450X250X10": {
    kind: "Rhs",
    naam: "RHS 450x250x10",
    h: 450,
    b: 250,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 148185e3, welY: 1639770, welZ: 1185480, wplY: 1999950, wplZ: 1330680, avZ: 8673.88, it: 332394e3, iw: 0, iRadY: 165.361, iRadZ: 104.798 }
  },
  "RHS450X250X125": {
    kind: "Rhs",
    naam: "RHS 450x250x12.5",
    h: 450,
    b: 250,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 179726e3, welY: 2001170, welZ: 1437810, wplY: 2457580, wplZ: 1630600, avZ: 10740.4, it: 406333e3, iw: 0, iRadY: 164.165, iRadZ: 103.717 }
  },
  "RHS450X250X16": {
    kind: "Rhs",
    naam: "RHS 450x250x16",
    h: 450,
    b: 250,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 220413e3, welY: 2475800, welZ: 1763310, wplY: 3070340, wplZ: 2029e3, avZ: 13565.1, it: 503675e3, iw: 0, iRadY: 162.478, iRadZ: 102.203 }
  },
  "RHS450X250X20": {
    kind: "Rhs",
    naam: "RHS 450x250x20",
    h: 450,
    b: 250,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 262159e3, welY: 2974630, welZ: 2097270, wplY: 3731200, wplZ: 2454130, avZ: 16695.5, it: 606094e3, iw: 0, iRadY: 160.533, iRadZ: 100.471 }
  },
  "RHS500X300X10": {
    kind: "Rhs",
    naam: "RHS 500x300x10",
    h: 500,
    b: 300,
    tw: 10,
    tf: 10,
    r: 15,
    props: { iz: 244394e3, welY: 2150490, welZ: 1629300, wplY: 2594770, wplZ: 1825500, avZ: 9682.94, it: 523985e3, iw: 0, iRadY: 186.284, iRadZ: 125.598 }
  },
  "RHS500X300X125": {
    kind: "Rhs",
    naam: "RHS 500x300x12.5",
    h: 500,
    b: 300,
    tw: 12.5,
    tf: 12.5,
    r: 18.75,
    props: { iz: 297805e3, welY: 2632520, welZ: 1985370, wplY: 3195580, wplZ: 2243600, avZ: 12004.6, it: 642903e3, iw: 0, iRadY: 185.107, iRadZ: 124.518 }
  },
  "RHS500X300X16": {
    kind: "Rhs",
    naam: "RHS 500x300x16",
    h: 500,
    b: 300,
    tw: 16,
    tf: 16,
    r: 24,
    props: { iz: 367682e3, welY: 3271320, welZ: 2451210, wplY: 4005070, wplZ: 2803740, avZ: 15188.3, it: 801239e3, iw: 0, iRadY: 183.45, iRadZ: 123.005 }
  },
  "RHS500X300X20": {
    kind: "Rhs",
    naam: "RHS 500x300x20",
    h: 500,
    b: 300,
    tw: 20,
    tf: 20,
    r: 30,
    props: { iz: 44078e4, welY: 3951070, welZ: 2938530, wplY: 4885470, wplZ: 3408400, avZ: 18731.7, it: 970533e3, iw: 0, iRadY: 181.542, iRadZ: 121.272 }
  },
  "CHS337X26": {
    kind: "Chs",
    naam: "CHS 33.7x2.6",
    h: 33.7,
    b: 33.7,
    tw: 2.6,
    tf: 2.6,
    r: 0,
    props: { iz: 30927.1, welY: 1835.44, welZ: 1835.44, wplY: 2520.6, wplZ: 2520.6, avZ: 161.72, it: 61854.2, iw: 0, iRadY: 11.0339, iRadZ: 11.0339 }
  },
  "CHS337X32": {
    kind: "Chs",
    naam: "CHS 33.7x3.2",
    h: 33.7,
    b: 33.7,
    tw: 3.2,
    tf: 3.2,
    r: 0,
    props: { iz: 36046.6, welY: 2139.26, welZ: 2139.26, wplY: 2987.72, wplZ: 2987.72, avZ: 195.2, it: 72093.1, iw: 0, iRadY: 10.8426, iRadZ: 10.8426 }
  },
  "CHS337X4": {
    kind: "Chs",
    naam: "CHS 33.7x4",
    h: 33.7,
    b: 33.7,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 41898.3, welY: 2486.54, welZ: 2486.54, wplY: 3549.69, wplZ: 3549.69, avZ: 237.6, it: 83796.6, iw: 0, iRadY: 10.5953, iRadZ: 10.5953 }
  },
  "CHS424X26": {
    kind: "Chs",
    naam: "CHS 42.4x2.6",
    h: 42.4,
    b: 42.4,
    tw: 2.6,
    tf: 2.6,
    r: 0,
    props: { iz: 64644.5, welY: 3049.27, welZ: 3049.27, wplY: 4124.36, wplZ: 4124.36, avZ: 206.96, it: 129289, iw: 0, iRadY: 14.1014, iRadZ: 14.1014 }
  },
  "CHS424X4": {
    kind: "Chs",
    naam: "CHS 42.4x4",
    h: 42.4,
    b: 42.4,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 89908.5, welY: 4240.97, welZ: 4240.97, wplY: 5919.57, wplZ: 5919.57, avZ: 307.2, it: 179817, iw: 0, iRadY: 13.6499, iRadZ: 13.6499 }
  },
  "CHS483X4": {
    kind: "Chs",
    naam: "CHS 48.3x4",
    h: 48.3,
    b: 48.3,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 137676, welY: 5700.86, welZ: 5700.86, wplY: 7871.29, wplZ: 7871.29, avZ: 354.4, it: 275352, iw: 0, iRadY: 15.7261, iRadZ: 15.7261 }
  },
  "CHS483X5": {
    kind: "Chs",
    naam: "CHS 48.3x5",
    h: 48.3,
    b: 48.3,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 161527, welY: 6688.51, welZ: 6688.51, wplY: 9416.12, wplZ: 9416.12, avZ: 433, it: 323055, iw: 0, iRadY: 15.4106, iRadZ: 15.4106 }
  },
  "CHS603X32": {
    kind: "Chs",
    naam: "CHS 60.3x3.2",
    h: 60.3,
    b: 60.3,
    tw: 3.2,
    tf: 3.2,
    r: 0,
    props: { iz: 234682, welY: 7783.82, welZ: 7783.82, wplY: 10444.2, wplZ: 10444.2, avZ: 365.44, it: 469364, iw: 0, iRadY: 20.2196, iRadZ: 20.2196 }
  },
  "CHS603X5": {
    kind: "Chs",
    naam: "CHS 60.3x5",
    h: 60.3,
    b: 60.3,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 334766, welY: 11103.3, welZ: 11103.3, wplY: 15332.1, wplZ: 15332.1, avZ: 553, it: 669532, iw: 0, iRadY: 19.6313, iRadZ: 19.6313 }
  },
  "CHS603X63": {
    kind: "Chs",
    naam: "CHS 60.3x6.3",
    h: 60.3,
    b: 60.3,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 394869, welY: 13096.8, welZ: 13096.8, wplY: 18454.1, wplZ: 18454.1, avZ: 680.4, it: 789738, iw: 0, iRadY: 19.2214, iRadZ: 19.2214 }
  },
  "CHS761X32": {
    kind: "Chs",
    naam: "CHS 76.1x3.2",
    h: 76.1,
    b: 76.1,
    tw: 3.2,
    tf: 3.2,
    r: 0,
    props: { iz: 487785, welY: 12819.6, welZ: 12819.6, wplY: 17017, wplZ: 17017, avZ: 466.56, it: 975570, iw: 0, iRadY: 25.7989, iRadZ: 25.7989 }
  },
  "CHS761X4": {
    kind: "Chs",
    naam: "CHS 76.1x4",
    h: 76.1,
    b: 76.1,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 590555, welY: 15520.5, welZ: 15520.5, wplY: 20815, wplZ: 20815, avZ: 576.8, it: 1181110, iw: 0, iRadY: 25.5304, iRadZ: 25.5304 }
  },
  "CHS761X63": {
    kind: "Chs",
    naam: "CHS 76.1x6.3",
    h: 76.1,
    b: 76.1,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 848185, welY: 22291.3, welZ: 22291.3, wplY: 30777.2, wplZ: 30777.2, avZ: 879.48, it: 1696370, iw: 0, iRadY: 24.7783, iRadZ: 24.7783 }
  },
  "CHS761X8": {
    kind: "Chs",
    naam: "CHS 76.1x8",
    h: 76.1,
    b: 76.1,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 1005870, welY: 26435.6, welZ: 26435.6, wplY: 37271.5, wplZ: 37271.5, avZ: 1089.6, it: 2011750, iw: 0, iRadY: 24.2426, iRadZ: 24.2426 }
  },
  "CHS889X32": {
    kind: "Chs",
    naam: "CHS 88.9x3.2",
    h: 88.9,
    b: 88.9,
    tw: 3.2,
    tf: 3.2,
    r: 0,
    props: { iz: 792059, welY: 17819.1, welZ: 17819.1, wplY: 23513.3, wplZ: 23513.3, avZ: 548.48, it: 1584120, iw: 0, iRadY: 30.3206, iRadZ: 30.3206 }
  },
  "CHS889X4": {
    kind: "Chs",
    naam: "CHS 88.9x4",
    h: 88.9,
    b: 88.9,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 963398, welY: 21673.8, welZ: 21673.8, wplY: 28853.4, wplZ: 28853.4, avZ: 679.2, it: 1926800, iw: 0, iRadY: 30.05, iRadZ: 30.05 }
  },
  "CHS889X63": {
    kind: "Chs",
    naam: "CHS 88.9x6.3",
    h: 88.9,
    b: 88.9,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 1402360, welY: 31549.2, welZ: 31549.2, wplY: 43066.7, wplZ: 43066.7, avZ: 1040.76, it: 2804720, iw: 0, iRadY: 29.2883, iRadZ: 29.2883 }
  },
  "CHS889X8": {
    kind: "Chs",
    naam: "CHS 88.9x8",
    h: 88.9,
    b: 88.9,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 1679660, welY: 37787.7, welZ: 37787.7, wplY: 52529.1, wplZ: 52529.1, avZ: 1294.4, it: 3359320, iw: 0, iRadY: 28.742, iRadZ: 28.742 }
  },
  "CHS1143X36": {
    kind: "Chs",
    naam: "CHS 114.3x3.6",
    h: 114.3,
    b: 114.3,
    tw: 3.6,
    tf: 3.6,
    r: 0,
    props: { iz: 1919840, welY: 33592.9, welZ: 33592.9, wplY: 44131.7, wplZ: 44131.7, avZ: 797.04, it: 3839670, iw: 0, iRadY: 39.1591, iRadZ: 39.1591 }
  },
  "CHS1143X4": {
    kind: "Chs",
    naam: "CHS 114.3x4",
    h: 114.3,
    b: 114.3,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 2110650, welY: 36931.8, welZ: 36931.8, wplY: 48685.7, wplZ: 48685.7, avZ: 882.4, it: 4221310, iw: 0, iRadY: 39.0226, iRadZ: 39.0226 }
  },
  "CHS1143X5": {
    kind: "Chs",
    naam: "CHS 114.3x5",
    h: 114.3,
    b: 114.3,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 2569200, welY: 44955.4, welZ: 44955.4, wplY: 59774.1, wplZ: 59774.1, avZ: 1093, it: 5138400, iw: 0, iRadY: 38.6838, iRadZ: 38.6838 }
  },
  "CHS1143X8": {
    kind: "Chs",
    naam: "CHS 114.3x8",
    h: 114.3,
    b: 114.3,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 3794920, welY: 66402.8, welZ: 66402.8, wplY: 90568.2, wplZ: 90568.2, avZ: 1700.8, it: 7589840, iw: 0, iRadY: 37.689, iRadZ: 37.689 }
  },
  "CHS1143X10": {
    kind: "Chs",
    naam: "CHS 114.3x10",
    h: 114.3,
    b: 114.3,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 4496630, welY: 78681.1, welZ: 78681.1, wplY: 109118, wplZ: 109118, avZ: 2086, it: 8993250, iw: 0, iRadY: 37.0447, iRadZ: 37.0447 }
  },
  "CHS1397X4": {
    kind: "Chs",
    naam: "CHS 139.7x4",
    h: 139.7,
    b: 139.7,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 3928590, welY: 56243.2, welZ: 56243.2, wplY: 73679.3, wplZ: 73679.3, avZ: 1085.6, it: 7857180, iw: 0, iRadY: 47.998, iRadZ: 47.998 }
  },
  "CHS1397X5": {
    kind: "Chs",
    naam: "CHS 139.7x5",
    h: 139.7,
    b: 139.7,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 4805410, welY: 68796.2, welZ: 68796.2, wplY: 90762.1, wplZ: 90762.1, avZ: 1347, it: 9610820, iw: 0, iRadY: 47.6564, iRadZ: 47.6564 }
  },
  "CHS1397X63": {
    kind: "Chs",
    naam: "CHS 139.7x6.3",
    h: 139.7,
    b: 139.7,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 5886210, welY: 84269.2, welZ: 84269.2, wplY: 112195, wplZ: 112195, avZ: 1680.84, it: 11772400, iw: 0, iRadY: 47.2166, iRadZ: 47.2166 }
  },
  "CHS1397X10": {
    kind: "Chs",
    naam: "CHS 139.7x10",
    h: 139.7,
    b: 139.7,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 8618940, welY: 123392, welZ: 123392, wplY: 168554, wplZ: 168554, avZ: 2594, it: 17237900, iw: 0, iRadY: 45.992, iRadZ: 45.992 }
  },
  "CHS1397X125": {
    kind: "Chs",
    naam: "CHS 139.7x12.5",
    h: 139.7,
    b: 139.7,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 10200100, welY: 146029, welZ: 146029, wplY: 202899, wplZ: 202899, avZ: 3180, it: 20400200, iw: 0, iRadY: 45.1886, iRadZ: 45.1886 }
  },
  "CHS1683X4": {
    kind: "Chs",
    naam: "CHS 168.3x4",
    h: 168.3,
    b: 168.3,
    tw: 4,
    tf: 4,
    r: 0,
    props: { iz: 6970920, welY: 82839.2, welZ: 82839.2, wplY: 107999, wplZ: 107999, avZ: 1314.4, it: 13941800, iw: 0, iRadY: 58.106, iRadZ: 58.106 }
  },
  "CHS1683X5": {
    kind: "Chs",
    naam: "CHS 168.3x5",
    h: 168.3,
    b: 168.3,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 8558460, welY: 101705, welZ: 101705, wplY: 133376, wplZ: 133376, avZ: 1633, it: 17116900, iw: 0, iRadY: 57.7623, iRadZ: 57.7623 }
  },
  "CHS1683X63": {
    kind: "Chs",
    naam: "CHS 168.3x6.3",
    h: 168.3,
    b: 168.3,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 10534200, welY: 125184, welZ: 125184, wplY: 165421, wplZ: 165421, avZ: 2041.2, it: 21068400, iw: 0, iRadY: 57.3189, iRadZ: 57.3189 }
  },
  "CHS1683X10": {
    kind: "Chs",
    naam: "CHS 168.3x10",
    h: 168.3,
    b: 168.3,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 15639800, welY: 185857, welZ: 185857, wplY: 250922, wplZ: 250922, avZ: 3166, it: 31279700, iw: 0, iRadY: 56.0791, iRadZ: 56.0791 }
  },
  "CHS1683X125": {
    kind: "Chs",
    naam: "CHS 168.3x12.5",
    h: 168.3,
    b: 168.3,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 18683500, welY: 222026, welZ: 222026, wplY: 304072, wplZ: 304072, avZ: 3895, it: 37367100, iw: 0, iRadY: 55.2606, iRadZ: 55.2606 }
  },
  "CHS1937X5": {
    kind: "Chs",
    naam: "CHS 193.7x5",
    h: 193.7,
    b: 193.7,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 13202300, welY: 136317, welZ: 136317, wplY: 178080, wplZ: 178080, avZ: 1887, it: 26404600, iw: 0, iRadY: 66.7389, iRadZ: 66.7389 }
  },
  "CHS1937X63": {
    kind: "Chs",
    naam: "CHS 193.7x6.3",
    h: 193.7,
    b: 193.7,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 16300500, welY: 168306, welZ: 168306, wplY: 221332, wplZ: 221332, avZ: 2361.24, it: 32600900, iw: 0, iRadY: 66.2933, iRadZ: 66.2933 }
  },
  "CHS1937X8": {
    kind: "Chs",
    naam: "CHS 193.7x8",
    h: 193.7,
    b: 193.7,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 20155400, welY: 208109, welZ: 208109, wplY: 276047, wplZ: 276047, avZ: 2971.2, it: 40310700, iw: 0, iRadY: 65.7158, iRadZ: 65.7158 }
  },
  "CHS1937X10": {
    kind: "Chs",
    naam: "CHS 193.7x10",
    h: 193.7,
    b: 193.7,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 24415900, welY: 252100, welZ: 252100, wplY: 337790, wplZ: 337790, avZ: 3674, it: 48831800, iw: 0, iRadY: 65.0439, iRadZ: 65.0439 }
  },
  "CHS1937X125": {
    kind: "Chs",
    naam: "CHS 193.7x12.5",
    h: 193.7,
    b: 193.7,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 29343100, welY: 302975, welZ: 302975, wplY: 411069, wplZ: 411069, avZ: 4530, it: 58686200, iw: 0, iRadY: 64.2161, iRadZ: 64.2161 }
  },
  "CHS1937X16": {
    kind: "Chs",
    naam: "CHS 193.7x16",
    h: 193.7,
    b: 193.7,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 35542600, welY: 366986, welZ: 366986, wplY: 506602, wplZ: 506602, avZ: 5686.4, it: 71085100, iw: 0, iRadY: 63.0806, iRadZ: 63.0806 }
  },
  "CHS2191X5": {
    kind: "Chs",
    naam: "CHS 219.1x5",
    h: 219.1,
    b: 219.1,
    tw: 5,
    tf: 5,
    r: 0,
    props: { iz: 19280400, welY: 175997, welZ: 175997, wplY: 229236, wplZ: 229236, avZ: 2141, it: 38560900, iw: 0, iRadY: 75.7164, iRadZ: 75.7164 }
  },
  "CHS2191X63": {
    kind: "Chs",
    naam: "CHS 219.1x6.3",
    h: 219.1,
    b: 219.1,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 23861400, welY: 217813, welZ: 217813, wplY: 285372, wplZ: 285372, avZ: 2681.28, it: 47722800, iw: 0, iRadY: 75.2691, iRadZ: 75.2691 }
  },
  "CHS2191X8": {
    kind: "Chs",
    naam: "CHS 219.1x8",
    h: 219.1,
    b: 219.1,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 29596300, welY: 270163, welZ: 270163, wplY: 356676, wplZ: 356676, avZ: 3377.6, it: 59192700, iw: 0, iRadY: 74.6887, iRadZ: 74.6887 }
  },
  "CHS2191X125": {
    kind: "Chs",
    naam: "CHS 219.1x12.5",
    h: 219.1,
    b: 219.1,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 43445800, welY: 396584, welZ: 396584, wplY: 534196, wplZ: 534196, avZ: 5165, it: 86891600, iw: 0, iRadY: 73.1777, iRadZ: 73.1777 }
  },
  "CHS2191X16": {
    kind: "Chs",
    naam: "CHS 219.1x16",
    h: 219.1,
    b: 219.1,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 52965900, welY: 483486, welZ: 483486, wplY: 661359, wplZ: 661359, avZ: 6499.2, it: 105932e3, iw: 0, iRadY: 72.0292, iRadZ: 72.0292 }
  },
  "CHS2191X20": {
    kind: "Chs",
    naam: "CHS 219.1x20",
    h: 219.1,
    b: 219.1,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 62612900, welY: 571547, welZ: 571547, wplY: 795483, wplZ: 795483, avZ: 7964, it: 125226e3, iw: 0, iRadY: 70.7467, iRadZ: 70.7467 }
  },
  "CHS2445X63": {
    kind: "Chs",
    naam: "CHS 244.5x6.3",
    h: 244.5,
    b: 244.5,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 33460300, welY: 273704, welZ: 273704, wplY: 357541, wplZ: 357541, avZ: 3001.32, it: 66920500, iw: 0, iRadY: 84.2459, iRadZ: 84.2459 }
  },
  "CHS2445X8": {
    kind: "Chs",
    naam: "CHS 244.5x8",
    h: 244.5,
    b: 244.5,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 41604500, welY: 340323, welZ: 340323, wplY: 447629, wplZ: 447629, avZ: 3784, it: 83208900, iw: 0, iRadY: 83.6632, iRadZ: 83.6632 }
  },
  "CHS2445X10": {
    kind: "Chs",
    naam: "CHS 244.5x10",
    h: 244.5,
    b: 244.5,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 50731500, welY: 414981, welZ: 414981, wplY: 550236, wplZ: 550236, avZ: 4690, it: 101463e3, iw: 0, iRadY: 82.9836, iRadZ: 82.9836 }
  },
  "CHS2445X125": {
    kind: "Chs",
    naam: "CHS 244.5x12.5",
    h: 244.5,
    b: 244.5,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 61474200, welY: 502856, welZ: 502856, wplY: 673451, wplZ: 673451, avZ: 5800, it: 122948e3, iw: 0, iRadY: 82.1434, iRadZ: 82.1434 }
  },
  "CHS2445X16": {
    kind: "Chs",
    naam: "CHS 244.5x16",
    h: 244.5,
    b: 244.5,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 75329100, welY: 616189, welZ: 616189, wplY: 836761, wplZ: 836761, avZ: 7312, it: 150658e3, iw: 0, iRadY: 80.9848, iRadZ: 80.9848 }
  },
  "CHS2445X20": {
    kind: "Chs",
    naam: "CHS 244.5x20",
    h: 244.5,
    b: 244.5,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 89572e3, welY: 732695, welZ: 732695, wplY: 1010670, wplZ: 1010670, avZ: 8980, it: 179144e3, iw: 0, iRadY: 79.6871, iRadZ: 79.6871 }
  },
  "CHS273X63": {
    kind: "Chs",
    naam: "CHS 273x6.3",
    h: 273,
    b: 273,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 46958200, welY: 344016, welZ: 344016, wplY: 448195, wplZ: 448195, avZ: 3360.42, it: 93916500, iw: 0, iRadY: 94.319, iRadZ: 94.319 }
  },
  "CHS273X8": {
    kind: "Chs",
    naam: "CHS 273x8",
    h: 273,
    b: 273,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 58517100, welY: 428697, welZ: 428697, wplY: 561971, wplZ: 561971, avZ: 4240, it: 117034e3, iw: 0, iRadY: 93.7343, iRadZ: 93.7343 }
  },
  "CHS273X125": {
    kind: "Chs",
    naam: "CHS 273x12.5",
    h: 273,
    b: 273,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 86974500, welY: 637176, welZ: 637176, wplY: 848904, wplZ: 848904, avZ: 6512.5, it: 173949e3, iw: 0, iRadY: 92.2066, iRadZ: 92.2066 }
  },
  "CHS273X16": {
    kind: "Chs",
    naam: "CHS 273x16",
    h: 273,
    b: 273,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 107068e3, welY: 784380, welZ: 784380, wplY: 1058150, wplZ: 1058150, avZ: 8224, it: 214136e3, iw: 0, iRadY: 91.0391, iRadZ: 91.0391 }
  },
  "CHS273X20": {
    kind: "Chs",
    naam: "CHS 273x20",
    h: 273,
    b: 273,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 127984e3, welY: 937614, welZ: 937614, wplY: 1282850, wplZ: 1282850, avZ: 10120, it: 255969e3, iw: 0, iRadY: 89.7281, iRadZ: 89.7281 }
  },
  "CHS3239X63": {
    kind: "Chs",
    naam: "CHS 323.9x6.3",
    h: 323.9,
    b: 323.9,
    tw: 6.3,
    tf: 6.3,
    r: 0,
    props: { iz: 79289e3, welY: 489589, welZ: 489589, wplY: 635563, wplZ: 635563, avZ: 4001.76, it: 158578e3, iw: 0, iRadY: 112.311, iRadZ: 112.311 }
  },
  "CHS3239X8": {
    kind: "Chs",
    naam: "CHS 323.9x8",
    h: 323.9,
    b: 323.9,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 99100800, welY: 611922, welZ: 611922, wplY: 798513, wplZ: 798513, avZ: 5054.4, it: 198202e3, iw: 0, iRadY: 111.723, iRadZ: 111.723 }
  },
  "CHS3239X10": {
    kind: "Chs",
    naam: "CHS 323.9x10",
    h: 323.9,
    b: 323.9,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 121583e3, welY: 750747, welZ: 750747, wplY: 985665, wplZ: 985665, avZ: 6278, it: 243167e3, iw: 0, iRadY: 111.037, iRadZ: 111.037 }
  },
  "CHS3239X16": {
    kind: "Chs",
    naam: "CHS 323.9x16",
    h: 323.9,
    b: 323.9,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 183899e3, welY: 1135530, welZ: 1135530, wplY: 1518200, wplZ: 1518200, avZ: 9852.8, it: 367799e3, iw: 0, iRadY: 109.006, iRadZ: 109.006 }
  },
  "CHS3239X20": {
    kind: "Chs",
    naam: "CHS 323.9x20",
    h: 323.9,
    b: 323.9,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 22139e4, welY: 1367030, welZ: 1367030, wplY: 1849770, wplZ: 1849770, avZ: 12156, it: 442781e3, iw: 0, iRadY: 107.677, iRadZ: 107.677 }
  },
  "CHS3556X8": {
    kind: "Chs",
    naam: "CHS 355.6x8",
    h: 355.6,
    b: 355.6,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 132014e3, welY: 742485, welZ: 742485, wplY: 966777, wplZ: 966777, avZ: 5561.6, it: 264027e3, iw: 0, iRadY: 122.928, iRadZ: 122.928 }
  },
  "CHS3556X10": {
    kind: "Chs",
    naam: "CHS 355.6x10",
    h: 355.6,
    b: 355.6,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 162235e3, welY: 912458, welZ: 912458, wplY: 1194730, wplZ: 1194730, avZ: 6912, it: 32447e4, iw: 0, iRadY: 122.239, iRadZ: 122.239 }
  },
  "CHS3556X125": {
    kind: "Chs",
    naam: "CHS 355.6x12.5",
    h: 355.6,
    b: 355.6,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 198522e3, welY: 1116550, welZ: 1116550, wplY: 1472120, wplZ: 1472120, avZ: 8577.5, it: 397044e3, iw: 0, iRadY: 121.385, iRadZ: 121.385 }
  },
  "CHS3556X16": {
    kind: "Chs",
    naam: "CHS 355.6x16",
    h: 355.6,
    b: 355.6,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 24663e4, welY: 1387120, welZ: 1387120, wplY: 1846620, wplZ: 1846620, avZ: 10867.2, it: 49326e4, iw: 0, iRadY: 120.2, iRadZ: 120.2 }
  },
  "CHS3556X20": {
    kind: "Chs",
    naam: "CHS 355.6x20",
    h: 355.6,
    b: 355.6,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 297917e3, welY: 1675570, welZ: 1675570, wplY: 2255210, wplZ: 2255210, avZ: 13424, it: 595834e3, iw: 0, iRadY: 118.863, iRadZ: 118.863 }
  },
  "CHS4064X8": {
    kind: "Chs",
    naam: "CHS 406.4x8",
    h: 406.4,
    b: 406.4,
    tw: 8,
    tf: 8,
    r: 0,
    props: { iz: 198739e3, welY: 978046, welZ: 978046, wplY: 1269950, wplZ: 1269950, avZ: 6374.4, it: 397478e3, iw: 0, iRadY: 140.884, iRadZ: 140.884 }
  },
  "CHS4064X10": {
    kind: "Chs",
    naam: "CHS 406.4x10",
    h: 406.4,
    b: 406.4,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 244758e3, welY: 1204520, welZ: 1204520, wplY: 1571660, wplZ: 1571660, avZ: 7928, it: 489516e3, iw: 0, iRadY: 140.193, iRadZ: 140.193 }
  },
  "CHS4064X125": {
    kind: "Chs",
    naam: "CHS 406.4x12.5",
    h: 406.4,
    b: 406.4,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 300307e3, welY: 1477890, welZ: 1477890, wplY: 1940120, wplZ: 1940120, avZ: 9847.5, it: 600613e3, iw: 0, iRadY: 139.335, iRadZ: 139.335 }
  },
  "CHS4064X20": {
    kind: "Chs",
    naam: "CHS 406.4x20",
    h: 406.4,
    b: 406.4,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 454321e3, welY: 2235830, welZ: 2235830, wplY: 2988770, wplZ: 2988770, avZ: 15456, it: 908643e3, iw: 0, iRadY: 136.796, iRadZ: 136.796 }
  },
  "CHS457X10": {
    kind: "Chs",
    naam: "CHS 457x10",
    h: 457,
    b: 457,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 350913e3, welY: 1535730, welZ: 1535730, wplY: 1998420, wplZ: 1998420, avZ: 8940, it: 701826e3, iw: 0, iRadY: 158.078, iRadZ: 158.078 }
  },
  "CHS457X125": {
    kind: "Chs",
    naam: "CHS 457x12.5",
    h: 457,
    b: 457,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 431448e3, welY: 1888180, welZ: 1888180, wplY: 2470400, wplZ: 2470400, avZ: 11112.5, it: 862896e3, iw: 0, iRadY: 157.217, iRadZ: 157.217 }
  },
  "CHS457X16": {
    kind: "Chs",
    naam: "CHS 457x16",
    h: 457,
    b: 457,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 539594e3, welY: 2361460, welZ: 2361460, wplY: 3113060, wplZ: 3113060, avZ: 14112, it: 107919e4, iw: 0, iRadY: 156.02, iRadZ: 156.02 }
  },
  "CHS457X20": {
    kind: "Chs",
    naam: "CHS 457x20",
    h: 457,
    b: 457,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 656815e3, welY: 2874460, welZ: 2874460, wplY: 3822050, wplZ: 3822050, avZ: 17480, it: 131363e4, iw: 0, iRadY: 154.665, iRadZ: 154.665 }
  },
  "CHS508X10": {
    kind: "Chs",
    naam: "CHS 508x10",
    h: 508,
    b: 508,
    tw: 10,
    tf: 10,
    r: 0,
    props: { iz: 485202e3, welY: 1910250, welZ: 1910250, wplY: 2480370, wplZ: 2480370, avZ: 9960, it: 970405e3, iw: 0, iRadY: 176.105, iRadZ: 176.105 }
  },
  "CHS508X125": {
    kind: "Chs",
    naam: "CHS 508x12.5",
    h: 508,
    b: 508,
    tw: 12.5,
    tf: 12.5,
    r: 0,
    props: { iz: 597554e3, welY: 2352570, welZ: 2352570, wplY: 3069650, wplZ: 3069650, avZ: 12387.5, it: 119511e4, iw: 0, iRadY: 175.241, iRadZ: 175.241 }
  },
  "CHS508X16": {
    kind: "Chs",
    naam: "CHS 508x16",
    h: 508,
    b: 508,
    tw: 16,
    tf: 16,
    r: 0,
    props: { iz: 74909e4, welY: 2949170, welZ: 2949170, wplY: 3874390, wplZ: 3874390, avZ: 15744, it: 149818e4, iw: 0, iRadY: 174.04, iRadZ: 174.04 }
  },
  "CHS508X20": {
    kind: "Chs",
    naam: "CHS 508x20",
    h: 508,
    b: 508,
    tw: 20,
    tf: 20,
    r: 0,
    props: { iz: 914278e3, welY: 3599520, welZ: 3599520, wplY: 4765550, wplZ: 4765550, avZ: 19520, it: 182856e4, iw: 0, iRadY: 172.679, iRadZ: 172.679 }
  },
  "DIE10": {
    kind: "ISection",
    naam: "DIE 10",
    h: 94,
    b: 99,
    tw: 5,
    tf: 8,
    r: 11,
    props: { iz: 1297540, welY: 69662.5, welZ: 26212.9, wplY: 79512.6, wplZ: 40206.4, avZ: 709.867, it: 48905.6, iw: 230305e4, iRadY: 39.6954, iRadZ: 24.9891 }
  },
  "DIE12": {
    kind: "ISection",
    naam: "DIE 12",
    h: 114,
    b: 119,
    tw: 5,
    tf: 8,
    r: 11,
    props: { iz: 2250890, welY: 104844, welZ: 37830.1, wplY: 117751, wplZ: 57771.4, avZ: 809.867, it: 56551.2, iw: 61502e5, iRadY: 48.913, iRadZ: 30.0188 }
  },
  "DIE14": {
    kind: "ISection",
    naam: "DIE 14",
    h: 133,
    b: 138,
    tw: 5.5,
    tf: 8.5,
    r: 12,
    props: { iz: 3728980, welY: 153374, welZ: 54043.2, wplY: 171379, wplZ: 82485.5, avZ: 1012.36, it: 79408.2, iw: 141001e5, iRadY: 57.2892, iRadZ: 34.6403 }
  },
  "DIE16": {
    kind: "ISection",
    naam: "DIE 16",
    h: 150,
    b: 157,
    tw: 6,
    tf: 9,
    r: 14,
    props: { iz: 5814690, welY: 211750, welZ: 74072.5, wplY: 235947, wplZ: 113139, avZ: 1266.25, it: 112184, iw: 28173e6, iRadY: 64.7646, iRadZ: 39.1885 }
  },
  "DIE18": {
    kind: "ISection",
    naam: "DIE 18",
    h: 172,
    b: 177,
    tw: 6.5,
    tf: 10,
    r: 14,
    props: { iz: 9253540, welY: 302934, welZ: 104560, wplY: 336545, wplZ: 159323, avZ: 1501.25, it: 162959, iw: 595018e5, iRadY: 74.4813, iRadZ: 44.3893 }
  },
  "DIE20": {
    kind: "ISection",
    naam: "DIE 20",
    h: 190,
    b: 197,
    tw: 7,
    tf: 11,
    r: 15,
    props: { iz: 14031900, welY: 408251, welZ: 142456, wplY: 452862, wplZ: 216831, avZ: 1776.14, it: 236137, iw: 110315e6, iRadY: 82.4648, iRadZ: 49.6022 }
  },
  "DIE22": {
    kind: "ISection",
    naam: "DIE 22",
    h: 211,
    b: 217,
    tw: 7.3,
    tf: 11.5,
    r: 15,
    props: { iz: 19602200, welY: 524612, welZ: 180665, wplY: 579863, wplZ: 274618, avZ: 1994.49, it: 289771, iw: 192045e6, iRadY: 91.8772, iRadZ: 54.6783 }
  },
  "DIE24": {
    kind: "ISection",
    naam: "DIE 24",
    h: 229,
    b: 237,
    tw: 7.8,
    tf: 12.5,
    r: 17,
    props: { iz: 27758700, welY: 676156, welZ: 234251, wplY: 746895, wplZ: 356069, avZ: 2361.78, it: 409559, iw: 320007e6, iRadY: 99.8564, iRadZ: 59.7928 }
  },
  "DIE26": {
    kind: "ISection",
    naam: "DIE 26",
    h: 250,
    b: 257,
    tw: 8,
    tf: 13,
    r: 17,
    props: { iz: 36805400, welY: 834595, welZ: 286424, wplY: 919012, wplZ: 434837, avZ: 2586.08, it: 487291, iw: 509728e6, iRadY: 109.366, iRadZ: 64.96 }
  },
  "DIE28": {
    kind: "ISection",
    naam: "DIE 28",
    h: 267,
    b: 277,
    tw: 8.3,
    tf: 13.5,
    r: 18,
    props: { iz: 47854500, welY: 1000550, welZ: 345520, wplY: 1099740, wplZ: 524327, avZ: 2868.17, it: 588334, iw: 758614e6, iRadY: 117.052, iRadZ: 70.0614 }
  },
  "DIE30": {
    kind: "ISection",
    naam: "DIE 30",
    h: 289,
    b: 297,
    tw: 8.8,
    tf: 14.5,
    r: 18,
    props: { iz: 63349700, welY: 1243630, welZ: 426597, wplY: 1365890, wplZ: 646891, avZ: 3215.72, it: 761127, iw: 117946e7, iRadY: 126.787, iRadZ: 75.278 }
  },
  "DIE32": {
    kind: "ISection",
    naam: "DIE 32",
    h: 308,
    b: 297,
    tw: 9.5,
    tf: 16,
    r: 20,
    props: { iz: 69915200, welY: 1464690, welZ: 470810, wplY: 1614350, wplZ: 715064, avZ: 3757.36, it: 1035900, iw: 147042e7, iRadY: 134.496, iRadZ: 74.8797 }
  },
  "DIE34": {
    kind: "ISection",
    naam: "DIE 34",
    h: 330,
    b: 297,
    tw: 10,
    tf: 17,
    r: 20,
    props: { iz: 74288100, welY: 1674280, welZ: 500257, wplY: 1848660, wplZ: 760427, avZ: 4153.36, it: 1231990, iw: 179628e7, iRadY: 143.576, iRadZ: 74.4535 }
  },
  "DIE36": {
    kind: "ISection",
    naam: "DIE 36",
    h: 348,
    b: 297,
    tw: 10.5,
    tf: 18,
    r: 21,
    props: { iz: 78667600, welY: 1877160, welZ: 529748, wplY: 2076990, wplZ: 806244, avZ: 4599.56, it: 1471590, iw: 211308e7, iRadY: 150.887, iRadZ: 74.0498 }
  },
  "DIE38": {
    kind: "ISection",
    naam: "DIE 38",
    h: 370,
    b: 297,
    tw: 11,
    tf: 19,
    r: 21,
    props: { iz: 83042600, welY: 2115420, welZ: 559209, wplY: 2344870, wplZ: 851886, avZ: 5037.56, it: 1719050, iw: 252481e7, iRadY: 159.847, iRadZ: 73.6325 }
  },
  "DIE40": {
    kind: "ISection",
    naam: "DIE 40",
    h: 388,
    b: 297,
    tw: 11,
    tf: 20,
    r: 21,
    props: { iz: 87410700, welY: 2330390, welZ: 588624, wplY: 2583050, wplZ: 896475, avZ: 5266.56, it: 1959650, iw: 292341e7, iRadY: 167.642, iRadZ: 73.7141 }
  },
  "DIE425": {
    kind: "ISection",
    naam: "DIE 42.5",
    h: 415,
    b: 297,
    tw: 11.5,
    tf: 21,
    r: 21,
    props: { iz: 91787700, welY: 2635250, welZ: 618099, wplY: 2926200, wplZ: 942479, avZ: 5791.56, it: 2260120, iw: 352066e7, iRadY: 178.603, iRadZ: 73.1747 }
  },
  "DIE45": {
    kind: "ISection",
    naam: "DIE 45",
    h: 438,
    b: 297,
    tw: 12,
    tf: 22,
    r: 23,
    props: { iz: 96181100, welY: 2939670, welZ: 647684, wplY: 3270980, wplZ: 989540, avZ: 6458.1, it: 2653680, iw: 410695e7, iRadY: 187.819, iRadZ: 72.5959 }
  },
  "DIE475": {
    kind: "ISection",
    naam: "DIE 47.5",
    h: 465,
    b: 297,
    tw: 12.5,
    tf: 23,
    r: 23,
    props: { iz: 100561e3, welY: 3283730, welZ: 677182, wplY: 3660730, wplZ: 1035940, avZ: 7037.1, it: 3022810, iw: 484973e7, iRadY: 198.616, iRadZ: 72.0834 }
  },
  "DIE50": {
    kind: "ISection",
    naam: "DIE 50",
    h: 488,
    b: 297,
    tw: 13,
    tf: 24,
    r: 24,
    props: { iz: 104952e3, welY: 3619140, welZ: 706750, wplY: 4042720, wplZ: 1082960, avZ: 7678.44, it: 3461510, iw: 557496e7, iRadY: 207.699, iRadZ: 71.6032 }
  },
  "DIE55": {
    kind: "ISection",
    naam: "DIE 55",
    h: 539,
    b: 297,
    tw: 13,
    tf: 24.5,
    r: 24,
    props: { iz: 107145e3, welY: 4154610, welZ: 721513, wplY: 4642570, wplZ: 1107130, avZ: 8358.94, it: 3677830, iw: 7006e9, iRadY: 228.644, iRadZ: 70.7297 }
  },
  "DIE60": {
    kind: "ISection",
    naam: "DIE 60",
    h: 588,
    b: 297,
    tw: 14,
    tf: 26,
    r: 26,
    props: { iz: 113757e3, welY: 4897640, welZ: 766037, wplY: 5497450, wplZ: 1180410, avZ: 9800.28, it: 4521950, iw: 886555e7, iRadY: 247.384, iRadZ: 69.5333 }
  },
  "DIE65": {
    kind: "ISection",
    naam: "DIE 65",
    h: 638,
    b: 297,
    tw: 14,
    tf: 26,
    r: 26,
    props: { iz: 113768e3, welY: 5422030, welZ: 766114, wplY: 6094400, wplZ: 1182860, avZ: 10500.3, it: 4566900, iw: 105237e8, iRadY: 267.187, iRadZ: 68.5249 }
  },
  "DIE70": {
    kind: "ISection",
    naam: "DIE 70",
    h: 688,
    b: 297,
    tw: 15,
    tf: 28,
    r: 27,
    props: { iz: 122566e3, welY: 6360460, welZ: 825361, wplY: 7180370, wplZ: 1278940, avZ: 12037.8, it: 5731610, iw: 131809e8, iRadY: 286.062, iRadZ: 67.7053 }
  },
  "DIE75": {
    kind: "ISection",
    naam: "DIE 75",
    h: 738,
    b: 297,
    tw: 15,
    tf: 28,
    r: 27,
    props: { iz: 12258e4, welY: 6948190, welZ: 825455, wplY: 7858190, wplZ: 1281760, avZ: 12787.8, it: 5788380, iw: 152661e8, iRadY: 305.407, iRadZ: 66.779 }
  },
  "DIE80": {
    kind: "ISection",
    naam: "DIE 80",
    h: 792,
    b: 298,
    tw: 16,
    tf: 30,
    r: 27,
    props: { iz: 132707e3, welY: 8083050, welZ: 890651, wplY: 9180840, wplZ: 1387690, avZ: 14437.8, it: 7108890, iw: 190412e8, iRadY: 325.465, iRadZ: 66.2698 }
  },
  "DIE85": {
    kind: "ISection",
    naam: "DIE 85",
    h: 842,
    b: 298,
    tw: 17,
    tf: 32,
    r: 30,
    props: { iz: 141661e3, welY: 9287350, welZ: 950743, wplY: 10592e3, wplZ: 1488820, avZ: 16462.6, it: 8850220, iw: 229289e8, iRadY: 343.848, iRadZ: 65.4491 }
  },
  "DIE90": {
    kind: "ISection",
    naam: "DIE 90",
    h: 892,
    b: 298,
    tw: 17,
    tf: 32,
    r: 30,
    props: { iz: 141681e3, welY: 10000900, welZ: 950880, wplY: 11429400, wplZ: 1492430, avZ: 17312.6, it: 8931150, iw: 258654e8, iRadY: 362.624, iRadZ: 64.6286 }
  },
  "DIE95": {
    kind: "ISection",
    naam: "DIE 95",
    h: 942,
    b: 298,
    tw: 17,
    tf: 32,
    r: 30,
    props: { iz: 141702e3, welY: 10728800, welZ: 951017, wplY: 12288e3, wplZ: 1496040, avZ: 18162.6, it: 9013850, iw: 289789e8, iRadY: 381.224, iRadZ: 63.8383 }
  },
  "DIE100": {
    kind: "ISection",
    naam: "DIE 100",
    h: 992,
    b: 298,
    tw: 17,
    tf: 32,
    r: 30,
    props: { iz: 141722e3, welY: 11470900, welZ: 951155, wplY: 13167900, wplZ: 1499660, avZ: 19012.6, it: 9095370, iw: 322695e8, iRadY: 399.659, iRadZ: 63.0766 }
  },
  "DIL10": {
    kind: "ISection",
    naam: "DIL 10",
    h: 100,
    b: 100,
    tw: 5,
    tf: 11,
    r: 11,
    props: { iz: 1837140, welY: 94312.2, welZ: 36742.8, wplY: 109301, wplZ: 56002.4, avZ: 790.867, it: 107005, iw: 351276e4, iRadY: 41.8389, iRadZ: 26.1146 }
  },
  "DIL12": {
    kind: "ISection",
    naam: "DIL 12",
    h: 120,
    b: 120,
    tw: 5,
    tf: 11,
    r: 11,
    props: { iz: 3172010, welY: 141428, welZ: 52866.9, wplY: 160719, wplZ: 80327.4, avZ: 890.867, it: 125561, iw: 919903e4, iRadY: 51.2251, iRadZ: 31.3189 }
  },
  "DIL14": {
    kind: "ISection",
    naam: "DIL 14",
    h: 140,
    b: 140,
    tw: 4.5,
    tf: 12,
    r: 12,
    props: { iz: 5492510, welY: 210959, welZ: 78464.5, wplY: 237016, wplZ: 118797, avZ: 987.611, it: 182676, iw: 220855e5, iRadY: 60.7175, iRadZ: 37.0298 }
  },
  "DIL16": {
    kind: "ISection",
    naam: "DIL 16",
    h: 160,
    b: 160,
    tw: 5,
    tf: 13,
    r: 14,
    props: { iz: 8882550, welY: 302776, welZ: 111032, wplY: 338951, wplZ: 168184, avZ: 1267.25, it: 270935, iw: 470696e5, iRadY: 69.614, iRadZ: 42.1561 }
  },
  "DIL18": {
    kind: "ISection",
    naam: "DIL 18",
    h: 180,
    b: 180,
    tw: 5.5,
    tf: 14,
    r: 14,
    props: { iz: 13617100, welY: 414523, welZ: 151301, wplY: 462349, wplZ: 228938, avZ: 1473.25, it: 372127, iw: 923641e5, iRadY: 78.5642, iRadZ: 47.4647 }
  },
  "DIL20": {
    kind: "ISection",
    naam: "DIL 20",
    h: 200,
    b: 200,
    tw: 6,
    tf: 15,
    r: 15,
    props: { iz: 20012400, welY: 551956, welZ: 200124, wplY: 614120, wplZ: 302757, avZ: 1753.14, it: 508179, iw: 168759e6, iRadY: 87.4762, iRadZ: 52.6729 }
  },
  "DIL22": {
    kind: "ISection",
    naam: "DIL 22",
    h: 220,
    b: 220,
    tw: 6.5,
    tf: 16,
    r: 15,
    props: { iz: 28408900, welY: 714383, welZ: 258263, wplY: 793022, wplZ: 390461, avZ: 1999.14, it: 668116, iw: 291972e6, iRadY: 96.4055, iRadZ: 57.9651 }
  },
  "DIL24": {
    kind: "ISection",
    naam: "DIL 24",
    h: 240,
    b: 240,
    tw: 7,
    tf: 17,
    r: 17,
    props: { iz: 39189600, welY: 909892, welZ: 326580, wplY: 1008710, wplZ: 493934, avZ: 2387.08, it: 887350, iw: 480849e6, iRadY: 105.285, iRadZ: 63.0762 }
  },
  "DIL26": {
    kind: "ISection",
    naam: "DIL 26",
    h: 260,
    b: 260,
    tw: 7.5,
    tf: 18,
    r: 17,
    props: { iz: 52752500, welY: 1132490, welZ: 405789, wplY: 1253480, wplZ: 613422, avZ: 2675.08, it: 1126340, iw: 763604e6, iRadY: 114.204, iRadZ: 68.3615 }
  },
  "DIL28": {
    kind: "ISection",
    naam: "DIL 28",
    h: 280,
    b: 280,
    tw: 8,
    tf: 19,
    r: 18,
    props: { iz: 69546100, welY: 1391280, welZ: 496758, wplY: 1538180, wplZ: 750903, avZ: 3050.12, it: 1427910, iw: 117135e7, iRadY: 123.098, iRadZ: 73.5555 }
  },
  "DIL30": {
    kind: "ISection",
    naam: "DIL 30",
    h: 300,
    b: 300,
    tw: 8.5,
    tf: 20,
    r: 18,
    props: { iz: 90035500, welY: 1683110, welZ: 600237, wplY: 1858690, wplZ: 906997, avZ: 3378.12, it: 1766640, iw: 17475e8, iRadY: 132.007, iRadZ: 78.8317 }
  },
  "DIL32": {
    kind: "ISection",
    naam: "DIL 32",
    h: 320,
    b: 300,
    tw: 9,
    tf: 21,
    r: 20,
    props: { iz: 94549300, welY: 1902560, welZ: 630329, wplY: 2103780, wplZ: 953709, avZ: 3874.36, it: 2083680, iw: 208931e7, iRadY: 140.388, iRadZ: 78.2402 }
  },
  "DIL34": {
    kind: "ISection",
    naam: "DIL 34",
    h: 340,
    b: 300,
    tw: 9.5,
    tf: 22,
    r: 20,
    props: { iz: 99055100, welY: 2128540, welZ: 660368, wplY: 2356170, wplZ: 999843, avZ: 4244.36, it: 2388780, iw: 247687e7, iRadY: 148.743, iRadZ: 77.8231 }
  },
  "DIL36": {
    kind: "ISection",
    naam: "DIL 36",
    h: 360,
    b: 300,
    tw: 10,
    tf: 23,
    r: 21,
    props: { iz: 103568e3, welY: 2372270, welZ: 690451, wplY: 2629450, wplZ: 1046520, avZ: 4714.56, it: 2750670, iw: 290669e7, iRadY: 157.023, iRadZ: 77.3314 }
  },
  "DIL38": {
    kind: "ISection",
    naam: "DIL 38",
    h: 380,
    b: 300,
    tw: 10.5,
    tf: 24,
    r: 21,
    props: { iz: 108075e3, welY: 2625350, welZ: 720502, wplY: 2913600, wplZ: 1092910, avZ: 5124.56, it: 3117450, iw: 338599e7, iRadY: 165.259, iRadZ: 76.9234 }
  },
  "DIL40": {
    kind: "ISection",
    naam: "DIL 40",
    h: 400,
    b: 300,
    tw: 11,
    tf: 25,
    r: 21,
    props: { iz: 112584e3, welY: 2892070, welZ: 750560, wplY: 3213850, wplZ: 1139450, avZ: 5553.56, it: 3515880, iw: 391494e7, iRadY: 173.439, iRadZ: 76.5182 }
  },
  "DIL425": {
    kind: "ISection",
    naam: "DIL 42.5",
    h: 425,
    b: 300,
    tw: 11.5,
    tf: 26,
    r: 21,
    props: { iz: 117094e3, welY: 3218890, welZ: 780629, wplY: 3581020, wplZ: 1186280, avZ: 6059.06, it: 3950260, iw: 461125e7, iRadY: 183.707, iRadZ: 76.0085 }
  },
  "DIL45": {
    kind: "ISection",
    naam: "DIL 45",
    h: 450,
    b: 300,
    tw: 12,
    tf: 27,
    r: 23,
    props: { iz: 121622e3, welY: 3576200, welZ: 810812, wplY: 3984330, wplZ: 1234310, avZ: 6772.1, it: 4503430, iw: 537599e7, iRadY: 193.88, iRadZ: 75.3767 }
  },
  "DIL475": {
    kind: "ISection",
    naam: "DIL 47.5",
    h: 475,
    b: 300,
    tw: 12.5,
    tf: 28,
    r: 23,
    props: { iz: 126136e3, welY: 3940610, welZ: 840904, wplY: 4396230, wplZ: 1281540, avZ: 7329.6, it: 5016340, iw: 622825e7, iRadY: 203.987, iRadZ: 74.8874 }
  },
  "DIL50": {
    kind: "ISection",
    naam: "DIL 50",
    h: 500,
    b: 300,
    tw: 13,
    tf: 29,
    r: 24,
    props: { iz: 13066e4, welY: 4331110, welZ: 871070, wplY: 4839250, wplZ: 1329540, avZ: 8009.44, it: 5620060, iw: 715954e7, iRadY: 214.014, iRadZ: 74.3437 }
  },
  "DIL55": {
    kind: "ISection",
    naam: "DIL 55",
    h: 550,
    b: 300,
    tw: 13.5,
    tf: 30,
    r: 24,
    props: { iz: 135183e3, welY: 5014220, welZ: 901220, wplY: 5608830, wplZ: 1378310, avZ: 8954.44, it: 6236560, iw: 903551e7, iRadY: 234.342, iRadZ: 73.3741 }
  },
  "DIL60": {
    kind: "ISection",
    naam: "DIL 60",
    h: 600,
    b: 300,
    tw: 14,
    tf: 31,
    r: 26,
    props: { iz: 139732e3, welY: 5762880, welZ: 931547, wplY: 6457480, wplZ: 1428790, avZ: 10158.3, it: 7025730, iw: 111739e8, iRadY: 254.404, iRadZ: 72.3257 }
  },
  "DIN10": {
    kind: "ISection",
    naam: "DIN 10",
    h: 100,
    b: 100,
    tw: 6.5,
    tf: 11,
    r: 11,
    props: { iz: 1838940, welY: 95498.5, welZ: 36778.9, wplY: 111582, wplZ: 56416.7, avZ: 924.367, it: 115427, iw: 34901e5, iRadY: 41.2158, iRadZ: 25.5778 }
  },
  "DIN12": {
    kind: "ISection",
    naam: "DIN 12",
    h: 120,
    b: 120,
    tw: 6.5,
    tf: 11,
    r: 11,
    props: { iz: 3174070, welY: 143389, welZ: 52901.1, wplY: 164321, wplZ: 80827.9, avZ: 1054.37, it: 134931, iw: 915841e4, iRadY: 50.4451, iRadZ: 30.6404 }
  },
  "DIN14": {
    kind: "ISection",
    naam: "DIN 14",
    h: 140,
    b: 140,
    tw: 8,
    tf: 12,
    r: 12,
    props: { iz: 5499090, welY: 217463, welZ: 78558.5, wplY: 248790, wplZ: 120282, avZ: 1435.61, it: 212498, iw: 219032e5, iRadY: 58.7412, iRadZ: 35.3059 }
  },
  "DIN16": {
    kind: "ISection",
    naam: "DIN 16",
    h: 160,
    b: 160,
    tw: 9,
    tf: 14,
    r: 14,
    props: { iz: 9576300, welY: 329229, welZ: 119704, wplY: 376822, wplZ: 183156, avZ: 1874.25, it: 380751, iw: 496102e5, iRadY: 67.178, iRadZ: 40.5072 }
  },
  "DIN18": {
    kind: "ISection",
    naam: "DIN 18",
    h: 180,
    b: 180,
    tw: 9,
    tf: 14,
    r: 14,
    props: { iz: 13628200, welY: 425904, welZ: 151424, wplY: 482565, wplZ: 231161, avZ: 2054.25, it: 422164, iw: 918293e5, iRadY: 76.3463, iRadZ: 45.5229 }
  },
  "DIN20": {
    kind: "ISection",
    naam: "DIN 20",
    h: 200,
    b: 200,
    tw: 10,
    tf: 16,
    r: 15,
    props: { iz: 21362300, welY: 595153, welZ: 213623, wplY: 674937, wplZ: 325813, avZ: 2513.14, it: 681945, iw: 177097e6, iRadY: 84.8162, iRadZ: 50.8147 }
  },
  "DIN22": {
    kind: "ISection",
    naam: "DIN 22",
    h: 220,
    b: 220,
    tw: 10,
    tf: 16,
    r: 15,
    props: { iz: 28425300, welY: 732002, welZ: 258412, wplY: 823948, wplZ: 393513, avZ: 2713.14, it: 743155, iw: 290741e6, iRadY: 93.998, iRadZ: 55.8494 }
  },
  "DIN24": {
    kind: "ISection",
    naam: "DIN 24",
    h: 240,
    b: 240,
    tw: 11,
    tf: 18,
    r: 17,
    props: { iz: 41518600, welY: 973865, welZ: 345988, wplY: 1097850, wplZ: 526877, avZ: 3302.08, it: 1150290, iw: 502426e6, iRadY: 102.459, iRadZ: 61.0707 }
  },
  "DIN26": {
    kind: "ISection",
    naam: "DIN 26",
    h: 260,
    b: 260,
    tw: 11,
    tf: 18,
    r: 17,
    props: { iz: 52776800, welY: 1157710, welZ: 405975, wplY: 1297390, wplZ: 617482, avZ: 3522.08, it: 1236770, iw: 761006e6, iRadY: 111.656, iRadZ: 66.1196 }
  },
  "DIN28": {
    kind: "ISection",
    naam: "DIN 28",
    h: 280,
    b: 280,
    tw: 12,
    tf: 20,
    r: 18,
    props: { iz: 73239e3, welY: 1480150, welZ: 523136, wplY: 1661060, wplZ: 795427, avZ: 4118.12, it: 1800240, iw: 121946e7, iRadY: 120.135, iRadZ: 71.4204 }
  },
  "DIN30": {
    kind: "ISection",
    naam: "DIN 30",
    h: 300,
    b: 300,
    tw: 12,
    tf: 20,
    r: 18,
    props: { iz: 90068500, welY: 1717290, welZ: 600457, wplY: 1917840, wplZ: 912147, avZ: 4358.12, it: 1918130, iw: 174271e7, iRadY: 129.34, iRadZ: 76.4808 }
  },
  "DIN32": {
    kind: "ISection",
    naam: "DIN 32",
    h: 320,
    b: 300,
    tw: 13,
    tf: 22,
    r: 20,
    props: { iz: 99096700, welY: 2015560, welZ: 660644, wplY: 2260220, wplZ: 1005430, avZ: 5097.36, it: 2579610, iw: 216764e7, iRadY: 137.202, iRadZ: 76.056 }
  },
  "DIN34": {
    kind: "ISection",
    naam: "DIN 34",
    h: 340,
    b: 300,
    tw: 13,
    tf: 22,
    r: 20,
    props: { iz: 99100300, welY: 2173030, welZ: 660669, wplY: 2432840, wplZ: 1006270, avZ: 5357.36, it: 2594330, iw: 247038e7, iRadY: 145.744, iRadZ: 75.4867 }
  },
  "DIN36": {
    kind: "ISection",
    naam: "DIN 36",
    h: 360,
    b: 300,
    tw: 14,
    tf: 24,
    r: 21,
    props: { iz: 108129e3, welY: 2506790, welZ: 720860, wplY: 2817180, wplZ: 1099710, avZ: 6090.56, it: 3366300, iw: 300663e7, iRadY: 153.515, iRadZ: 75.1494 }
  },
  "DIN38": {
    kind: "ISection",
    naam: "DIN 38",
    h: 380,
    b: 300,
    tw: 14,
    tf: 24,
    r: 21,
    props: { iz: 108134e3, welY: 2681530, welZ: 720890, wplY: 3010050, wplZ: 1100690, avZ: 6370.56, it: 3385500, iw: 337772e7, iRadY: 161.946, iRadZ: 74.6075 }
  },
  "DIN40": {
    kind: "ISection",
    naam: "DIN 40",
    h: 400,
    b: 300,
    tw: 14,
    tf: 26,
    r: 21,
    props: { iz: 117137e3, welY: 3032100, welZ: 780915, wplY: 3405160, wplZ: 1191480, avZ: 6706.56, it: 4154080, iw: 404239e7, iRadY: 170.541, iRadZ: 74.9529 }
  },
  "DIN425": {
    kind: "ISection",
    naam: "DIN 42.5",
    h: 425,
    b: 300,
    tw: 14,
    tf: 26,
    r: 21,
    props: { iz: 117143e3, welY: 3269770, welZ: 780953, wplY: 3667980, wplZ: 1192700, avZ: 7056.56, it: 4177070, iw: 460422e7, iRadY: 181.036, iRadZ: 74.3335 }
  },
  "DIN45": {
    kind: "ISection",
    naam: "DIN 45",
    h: 450,
    b: 300,
    tw: 15,
    tf: 28,
    r: 23,
    props: { iz: 126192e3, welY: 3743240, welZ: 841279, wplY: 4214060, wplZ: 1287900, avZ: 8072.1, it: 5282880, iw: 553909e7, iRadY: 190.681, iRadZ: 73.8087 }
  },
  "DIN475": {
    kind: "ISection",
    naam: "DIN 47.5",
    h: 475,
    b: 300,
    tw: 15,
    tf: 28,
    r: 23,
    props: { iz: 126199e3, welY: 4005130, welZ: 841325, wplY: 4505950, wplZ: 1289310, avZ: 8447.1, it: 5311190, iw: 621919e7, iRadY: 201.023, iRadZ: 73.2205 }
  },
  "DIN50": {
    kind: "ISection",
    naam: "DIN 50",
    h: 500,
    b: 300,
    tw: 16,
    tf: 30,
    r: 24,
    props: { iz: 135248e3, welY: 4527070, welZ: 901656, wplY: 5110530, wplZ: 1384770, avZ: 9454.44, it: 6550770, iw: 736313e7, iRadY: 210.531, iRadZ: 72.7785 }
  },
  "DIN55": {
    kind: "ISection",
    naam: "DIN 55",
    h: 550,
    b: 300,
    tw: 16,
    tf: 30,
    r: 24,
    props: { iz: 135266e3, welY: 5103340, welZ: 901770, wplY: 5758890, wplZ: 1387970, avZ: 10254.4, it: 6616040, iw: 902416e7, iRadY: 230.851, iRadZ: 71.669 }
  },
  "DIN60": {
    kind: "ISection",
    naam: "DIN 60",
    h: 600,
    b: 300,
    tw: 17,
    tf: 32,
    r: 26,
    props: { iz: 144352e3, welY: 6027640, welZ: 962347, wplY: 6825950, wplZ: 1487030, avZ: 11900.3, it: 8166870, iw: 114784e8, iRadY: 250.175, iRadZ: 70.6839 }
  },
  "DIN65": {
    kind: "ISection",
    naam: "DIN 65",
    h: 650,
    b: 300,
    tw: 17,
    tf: 32,
    r: 26,
    props: { iz: 144372e3, welY: 6670230, welZ: 962483, wplY: 7558890, wplZ: 1490640, avZ: 12750.3, it: 8249530, iw: 136023e8, iRadY: 269.976, iRadZ: 69.6715 }
  },
  "DIN70": {
    kind: "ISection",
    naam: "DIN 70",
    h: 700,
    b: 300,
    tw: 18,
    tf: 34,
    r: 27,
    props: { iz: 153465e3, welY: 7722560, welZ: 1023100, wplY: 8784580, wplZ: 1590600, avZ: 14449.8, it: 9969020, iw: 167853e8, iRadY: 288.822, iRadZ: 68.8208 }
  },
  "DIN75": {
    kind: "ISection",
    naam: "DIN 75",
    h: 750,
    b: 300,
    tw: 18,
    tf: 34,
    r: 27,
    props: { iz: 153489e3, welY: 8433500, welZ: 1023260, wplY: 9605870, wplZ: 1594650, avZ: 15349.8, it: 10065800, iw: 194171e8, iRadY: 308.167, iRadZ: 67.8898 }
  },
  "DIN80": {
    kind: "ISection",
    naam: "DIN 80",
    h: 800,
    b: 300,
    tw: 18,
    tf: 34,
    r: 27,
    props: { iz: 153513e3, welY: 9159650, welZ: 1023420, wplY: 10449700, wplZ: 1598700, avZ: 16249.8, it: 10162300, iw: 222407e8, iRadY: 327.299, iRadZ: 66.9959 }
  },
  "DIN85": {
    kind: "ISection",
    naam: "DIN 85",
    h: 850,
    b: 300,
    tw: 19,
    tf: 36,
    r: 30,
    props: { iz: 162672e3, welY: 10444500, welZ: 1084480, wplY: 11961700, wplZ: 1702730, avZ: 18398.6, it: 1236e4, iw: 265682e8, iRadY: 345.646, iRadZ: 66.1683 }
  },
  "DIN90": {
    kind: "ISection",
    naam: "DIN 90",
    h: 900,
    b: 300,
    tw: 19,
    tf: 36,
    r: 30,
    props: { iz: 1627e5, welY: 11245300, welZ: 1084670, wplY: 12902400, wplZ: 1707240, avZ: 19348.6, it: 12477300, iw: 299545e8, iRadY: 364.421, iRadZ: 65.344 }
  },
  "DIN95": {
    kind: "ISection",
    naam: "DIN 95",
    h: 950,
    b: 300,
    tw: 19,
    tf: 36,
    r: 30,
    props: { iz: 162729e3, welY: 12062200, welZ: 1084860, wplY: 13866900, wplZ: 1711760, avZ: 20298.6, it: 12592400, iw: 335441e8, iRadY: 383.022, iRadZ: 64.5501 }
  },
  "DIN100": {
    kind: "ISection",
    naam: "DIN 100",
    h: 1e3,
    b: 300,
    tw: 19,
    tf: 36,
    r: 30,
    props: { iz: 162758e3, welY: 12895e3, welZ: 1085050, wplY: 14855100, wplZ: 1716270, avZ: 21248.6, it: 12705400, iw: 37337e9, iRadY: 401.458, iRadZ: 63.7846 }
  },
  "INP80": {
    kind: "ISection",
    naam: "INP 80",
    h: 80,
    b: 42,
    tw: 3.9,
    tf: 5.9,
    r: 3.9,
    flensHelling: 0.14,
    props: { iz: 62748.1, welY: 19413.7, welZ: 2988, wplY: 22699.9, wplZ: 4977.01, avZ: 330.601, it: 8175.76, iw: 81087900, iRadY: 32.0248, iRadZ: 9.10339 }
  },
  "INP100": {
    kind: "ISection",
    naam: "INP 100",
    h: 100,
    b: 50,
    tw: 4.5,
    tf: 6.8,
    r: 4.5,
    flensHelling: 0.14,
    props: { iz: 121504, welY: 34054.1, welZ: 4860.17, wplY: 39735, wplZ: 8121.37, avZ: 474.246, it: 15094, iw: 249367e3, iRadY: 40.0329, iRadZ: 10.6941 }
  },
  "INP120": {
    kind: "ISection",
    naam: "INP 120",
    h: 120,
    b: 58,
    tw: 5.1,
    tf: 7.7,
    r: 5.1,
    flensHelling: 0.14,
    props: { iz: 214055, welY: 54518.3, welZ: 7381.2, wplY: 63534.5, wplZ: 12362.5, avZ: 642.632, it: 25664, iw: 639482e3, iRadY: 48.0292, iRadZ: 12.2863 }
  },
  "INP140": {
    kind: "ISection",
    naam: "INP 140",
    h: 140,
    b: 66,
    tw: 5.7,
    tf: 8.6,
    r: 5.7,
    flensHelling: 0.14,
    props: { iz: 351353, welY: 81764.3, welZ: 10647.1, wplY: 95210.6, wplZ: 17863.5, avZ: 835.761, it: 40997.2, iw: 143969e4, iRadY: 56.0183, iRadZ: 13.8794 }
  },
  "INP160": {
    kind: "ISection",
    naam: "INP 160",
    h: 160,
    b: 74,
    tw: 6.3,
    tf: 9.5,
    r: 6.3,
    flensHelling: 0.14,
    props: { iz: 545887, welY: 116750, welZ: 14753.7, wplY: 135876, wplZ: 24787.5, avZ: 1053.63, it: 62307, iw: 293837e4, iRadY: 64.0027, iRadZ: 15.4731 }
  },
  "INP180": {
    kind: "ISection",
    naam: "INP 180",
    h: 180,
    b: 82,
    tw: 6.9,
    tf: 10.4,
    r: 6.9,
    flensHelling: 0.14,
    props: { iz: 811682, welY: 160434, welZ: 19797.1, wplY: 186642, wplZ: 33297.6, avZ: 1296.24, it: 91019, iw: 555424e4, iRadY: 71.9838, iRadZ: 17.0671 }
  },
  "INP200": {
    kind: "ISection",
    naam: "INP 200",
    h: 200,
    b: 90,
    tw: 7.5,
    tf: 11.3,
    r: 7.5,
    flensHelling: 0.14,
    props: { iz: 1164300, welY: 213774, welZ: 25873.3, wplY: 248623, wplZ: 43556.9, avZ: 1563.6, it: 128650, iw: 987101e4, iRadY: 79.9625, iRadZ: 18.6613 }
  },
  "INP220": {
    kind: "ISection",
    naam: "INP 220",
    h: 220,
    b: 98,
    tw: 8.1,
    tf: 12.2,
    r: 8.1,
    flensHelling: 0.14,
    props: { iz: 1620830, welY: 277727, welZ: 33078.1, wplY: 322929, wplZ: 55728.5, avZ: 1855.7, it: 176908, iw: 166755e5, iRadY: 87.9393, iRadZ: 20.2556 }
  },
  "INP240": {
    kind: "ISection",
    naam: "INP 240",
    h: 240,
    b: 106,
    tw: 8.7,
    tf: 13.1,
    r: 8.7,
    flensHelling: 0.14,
    props: { iz: 2199910, welY: 353253, welZ: 41507.6, wplY: 410674, wplZ: 69975.5, avZ: 2172.54, it: 237499, iw: 270007e5, iRadY: 95.9148, iRadZ: 21.8501 }
  },
  "INP260": {
    kind: "ISection",
    naam: "INP 260",
    h: 260,
    b: 113,
    tw: 9.4,
    tf: 14.1,
    r: 9.4,
    flensHelling: 0.14,
    props: { iz: 2873030, welY: 441089, welZ: 50850, wplY: 513371, wplZ: 85836.2, avZ: 2543.18, it: 317715, iw: 414232e5, iRadY: 103.701, iRadZ: 23.2123 }
  },
  "INP280": {
    kind: "ISection",
    naam: "INP 280",
    h: 280,
    b: 119,
    tw: 10.1,
    tf: 15.2,
    r: 10.1,
    flensHelling: 0.14,
    props: { iz: 3631180, welY: 541119, welZ: 61028.2, wplY: 630706, wplZ: 103088, avZ: 2944.72, it: 418989, iw: 607284e5, iRadY: 111.425, iRadZ: 24.3947 }
  },
  "INP300": {
    kind: "ISection",
    naam: "INP 300",
    h: 300,
    b: 125,
    tw: 10.8,
    tf: 16.2,
    r: 10.8,
    flensHelling: 0.14,
    props: { iz: 4495750, welY: 652361, welZ: 71932, wplY: 761486, wplZ: 121697, avZ: 3374.58, it: 536268, iw: 863781e5, iRadY: 119.09, iRadZ: 25.5262 }
  },
  "INP320": {
    kind: "ISection",
    naam: "INP 320",
    h: 320,
    b: 131,
    tw: 11.5,
    tf: 17.3,
    r: 11.5,
    flensHelling: 0.14,
    props: { iz: 5542750, welY: 780864, welZ: 84622.2, wplY: 912550, wplZ: 143260, avZ: 3834.86, it: 684482, iw: 121172e6, iRadY: 126.8, iRadZ: 26.7076 }
  },
  "INP340": {
    kind: "ISection",
    naam: "INP 340",
    h: 340,
    b: 137,
    tw: 12.2,
    tf: 18.3,
    r: 12.2,
    flensHelling: 0.14,
    props: { iz: 6717980, welY: 921709, welZ: 98072.8, wplY: 1078460, wplZ: 166268, avZ: 4323.32, it: 851730, iw: 165893e6, iRadY: 134.452, iRadZ: 27.8398 }
  },
  "INP360": {
    kind: "ISection",
    naam: "INP 360",
    h: 360,
    b: 143,
    tw: 13,
    tf: 19.5,
    r: 13,
    flensHelling: 0.14,
    props: { iz: 8166280, welY: 1087490, welZ: 114214, wplY: 1274260, wplZ: 193819, avZ: 4881.78, it: 1078070, iw: 225871e6, iRadY: 142.07, iRadZ: 29.0178 }
  },
  "INP380": {
    kind: "ISection",
    naam: "INP 380",
    h: 380,
    b: 149,
    tw: 13.7,
    tf: 20.5,
    r: 13.7,
    flensHelling: 0.14,
    props: { iz: 9724710, welY: 1261960, welZ: 130533, wplY: 1480170, wplZ: 221797, avZ: 5431.05, it: 1310930, iw: 299846e6, iRadY: 149.713, iRadZ: 30.1507 }
  },
  "INP400": {
    kind: "ISection",
    naam: "INP 400",
    h: 400,
    b: 155,
    tw: 14.4,
    tf: 21.6,
    r: 14.4,
    flensHelling: 0.14,
    props: { iz: 11557500, welY: 1458580, welZ: 149129, wplY: 1712130, wplZ: 253531, avZ: 6011.01, it: 1595230, iw: 394843e6, iRadY: 157.406, iRadZ: 31.3309 }
  },
  "INP450": {
    kind: "ISection",
    naam: "INP 450",
    h: 450,
    b: 170,
    tw: 16.2,
    tf: 24.3,
    r: 16.2,
    flensHelling: 0.14,
    props: { iz: 17219e3, welY: 2035090, welZ: 202576, wplY: 2393680, wplZ: 345096, avZ: 7612.65, it: 2502740, iw: 744484e6, iRadY: 176.53, iRadZ: 34.2325 }
  },
  "INP500": {
    kind: "ISection",
    naam: "INP 500",
    h: 500,
    b: 185,
    tw: 18,
    tf: 27,
    r: 18,
    flensHelling: 0.14,
    props: { iz: 24731700, welY: 2745870, welZ: 267370, wplY: 3235110, wplZ: 456293, avZ: 9403.23, it: 3750850, iw: 132003e7, iRadY: 195.64, iRadZ: 37.1342 }
  },
  "INP550": {
    kind: "ISection",
    naam: "INP 550",
    h: 550,
    b: 200,
    tw: 19,
    tf: 30,
    r: 19,
    flensHelling: 0.14,
    props: { iz: 34880400, welY: 3599800, welZ: 348804, wplY: 4231180, wplZ: 591532, avZ: 10921.5, it: 5311640, iw: 225488e7, iRadY: 216.033, iRadZ: 40.5513 }
  },
  "INP600": {
    kind: "ISection",
    naam: "INP 600",
    h: 600,
    b: 215,
    tw: 21.6,
    tf: 32.4,
    r: 21.6,
    flensHelling: 0.14,
    props: { iz: 46799200, welY: 4626250, welZ: 435341, wplY: 5464800, wplZ: 745187, avZ: 13551.2, it: 7579710, iw: 359622e7, iRadY: 233.829, iRadZ: 42.938 }
  },
  "L20X20X3": {
    kind: "Angle",
    naam: "L 20x20x3",
    h: 20,
    b: 20,
    tw: 3,
    tf: 3,
    r: 3.5,
    r2: 2,
    props: { iz: 3876.8, welY: 276.208, welZ: 276.208, wplY: 510.412, wplZ: 510.412, avZ: 60, it: 367.726, iw: 8086.92, iRadY: 5.8857, iRadZ: 5.8857 }
  },
  "L25X25X3": {
    kind: "Angle",
    naam: "L 25x25x3",
    h: 25,
    b: 25,
    tw: 3,
    tf: 3,
    r: 3.5,
    r2: 2,
    props: { iz: 7961.4, welY: 447.519, welZ: 447.519, wplY: 821.236, wplZ: 821.236, avZ: 75, it: 457.581, iw: 17429.4, iRadY: 7.49006, iRadZ: 7.49006 }
  },
  "L40X40X4": {
    kind: "Angle",
    naam: "L 40x40x4",
    h: 40,
    b: 40,
    tw: 4,
    tf: 4,
    r: 6,
    r2: 3,
    props: { iz: 44729.8, welY: 1552.91, welZ: 1552.91, wplY: 2852.37, wplZ: 2852.37, avZ: 160, it: 1825.6, iw: 177300, iRadY: 12.0537, iRadZ: 12.0537 }
  },
  "L45X45X5": {
    kind: "Angle",
    naam: "L 45x45x5",
    h: 45,
    b: 45,
    tw: 5,
    tf: 5,
    r: 7,
    r2: 3.5,
    props: { iz: 78409.9, welY: 2434.54, welZ: 2434.54, wplY: 4472.54, wplZ: 4472.54, avZ: 225, it: 3967.8, iw: 480242, iRadY: 13.4996, iRadZ: 13.4996 }
  },
  "L50X50X5": {
    kind: "Angle",
    naam: "L 50x50x5",
    h: 50,
    b: 50,
    tw: 5,
    tf: 5,
    r: 7,
    r2: 3.5,
    props: { iz: 109643, welY: 3048.71, welZ: 3048.71, wplY: 5584.53, wplZ: 5584.53, avZ: 250, it: 4383.53, iw: 681266, iRadY: 15.1096, iRadZ: 15.1096 }
  },
  "L60X60X6": {
    kind: "Angle",
    naam: "L 60x60x6",
    h: 60,
    b: 60,
    tw: 6,
    tf: 6,
    r: 8,
    r2: 4,
    props: { iz: 227925, welY: 5285.22, welZ: 5285.22, wplY: 9664.94, wplZ: 9664.94, avZ: 360, it: 8995.7, iw: 2044420, iRadY: 18.1635, iRadZ: 18.1635 }
  },
  "L70X70X7": {
    kind: "Angle",
    naam: "L 70x70x7",
    h: 70,
    b: 70,
    tw: 7,
    tf: 7,
    r: 9,
    r2: 4.5,
    props: { iz: 422977, welY: 8411.29, welZ: 8411.29, wplY: 15363.9, wplZ: 15363.9, avZ: 490, it: 16546.5, iw: 5172890, iRadY: 21.2161, iRadZ: 21.2161 }
  },
  "L80X80X8": {
    kind: "Angle",
    naam: "L 80x80x8",
    h: 80,
    b: 80,
    tw: 8,
    tf: 8,
    r: 10,
    r2: 5,
    props: { iz: 722469, welY: 12575.7, welZ: 12575.7, wplY: 22951.7, wplZ: 22951.7, avZ: 640, it: 28080.8, iw: 11552900, iRadY: 24.2681, iRadZ: 24.2681 }
  },
  "L90X90X9": {
    kind: "Angle",
    naam: "L 90x90x9",
    h: 90,
    b: 90,
    tw: 9,
    tf: 9,
    r: 11,
    r2: 5.5,
    props: { iz: 1158330, welY: 17927.4, welZ: 17927.4, wplY: 32698.6, wplZ: 32698.6, avZ: 810, it: 44801, iw: 23468200, iRadY: 27.3195, iRadZ: 27.3195 }
  },
  "L100X100X10": {
    kind: "Angle",
    naam: "L 100x100x10",
    h: 100,
    b: 100,
    tw: 10,
    tf: 10,
    r: 12,
    r2: 6,
    props: { iz: 1766760, welY: 24615.2, welZ: 24615.2, wplY: 44875, wplZ: 44875, avZ: 1e3, it: 68068.2, iw: 44229300, iRadY: 30.3706, iRadZ: 30.3706 }
  },
  "L110X110X10": {
    kind: "Angle",
    naam: "L 110x110x10",
    h: 110,
    b: 110,
    tw: 10,
    tf: 10,
    r: 12,
    r2: 6,
    props: { iz: 2386990, welY: 30108.2, welZ: 30108.2, wplY: 54798.9, wplZ: 54798.9, avZ: 1100, it: 74721.6, iw: 60323800, iRadY: 33.5911, iRadZ: 33.5911 }
  },
  "L120X120X12": {
    kind: "Angle",
    naam: "L 120x120x12",
    h: 120,
    b: 120,
    tw: 12,
    tf: 12,
    r: 13,
    r2: 6.5,
    props: { iz: 3676670, welY: 42734.9, welZ: 42734.9, wplY: 77724.8, wplZ: 77724.8, avZ: 1440, it: 138960, iw: 133098e3, iRadY: 36.5371, iRadZ: 36.5371 }
  },
  "L150X150X15": {
    kind: "Angle",
    naam: "L 150x150x15",
    h: 150,
    b: 150,
    tw: 15,
    tf: 15,
    r: 16,
    r2: 8,
    props: { iz: 8980520, welY: 83519.1, welZ: 83519.1, wplY: 151854, wplZ: 151854, avZ: 2250, it: 338531, iw: 50831e4, iRadY: 45.6869, iRadZ: 45.6869 }
  },
  "L180X180X18": {
    kind: "Angle",
    naam: "L 180x180x18",
    h: 180,
    b: 180,
    tw: 18,
    tf: 18,
    r: 18,
    r2: 9,
    props: { iz: 18656e3, welY: 144670, welZ: 144670, wplY: 262726, wplZ: 262726, avZ: 3240, it: 696310, iw: 152458e4, iRadY: 54.8956, iRadZ: 54.8956 }
  },
  "L200X200X20": {
    kind: "Angle",
    naam: "L 200x200x20",
    h: 200,
    b: 200,
    tw: 20,
    tf: 20,
    r: 18,
    r2: 9,
    props: { iz: 28505900, welY: 199111, welZ: 199111, wplY: 361009, wplZ: 361009, avZ: 4e3, it: 1049240, iw: 288653e4, iRadY: 61.1039, iRadZ: 61.1039 }
  },
  "L30X20X3": {
    kind: "Angle",
    naam: "L 30x20x3",
    h: 30,
    b: 20,
    tw: 3,
    tf: 3,
    r: 3.5,
    r2: 2,
    props: { iz: 4370.79, welY: 620.213, welZ: 291.784, wplY: 1130.14, wplZ: 544.486, avZ: 90, it: 457.524, iw: 19676.3, iRadY: 9.36608, iRadZ: 5.54971 }
  },
  "L30X20X4": {
    kind: "Angle",
    naam: "L 30x20x4",
    h: 30,
    b: 20,
    tw: 4,
    tf: 4,
    r: 3.5,
    r2: 2,
    props: { iz: 5527.36, welY: 807.18, welZ: 378.897, wplY: 1459.09, wplZ: 715.739, avZ: 120, it: 1033.34, iw: 42744.1, iRadY: 9.2637, iRadZ: 5.46734 }
  },
  "L40X20X3": {
    kind: "Angle",
    naam: "L 40x20x3",
    h: 40,
    b: 20,
    tw: 3,
    tf: 3,
    r: 3.5,
    r2: 2,
    props: { iz: 4700.21, welY: 1084.34, welZ: 301.414, wplY: 1914.7, wplZ: 572.679, avZ: 120, it: 547.338, iw: 43184.7, iRadY: 12.7436, iRadZ: 5.22884 }
  },
  "L40X20X4": {
    kind: "Angle",
    naam: "L 40x20x4",
    h: 40,
    b: 20,
    tw: 4,
    tf: 4,
    r: 3.5,
    r2: 2,
    props: { iz: 5963.54, welY: 1416.66, welZ: 392.471, wplY: 2483.64, wplZ: 764.559, avZ: 160, it: 1246.07, iw: 95460.6, iRadY: 12.6266, iRadZ: 5.14927 }
  },
  "L45X30X4": {
    kind: "Angle",
    naam: "L 45x30x4",
    h: 45,
    b: 30,
    tw: 4,
    tf: 4,
    r: 4.5,
    r2: 2,
    props: { iz: 20525.9, welY: 1912.32, welZ: 908.265, wplY: 3464.16, wplZ: 1664.82, avZ: 180, it: 1621.21, iw: 167522, iRadY: 14.1976, iRadZ: 8.46235 }
  },
  "L45X30X5": {
    kind: "Angle",
    naam: "L 45x30x5",
    h: 45,
    b: 30,
    tw: 5,
    tf: 5,
    r: 4.5,
    r2: 2,
    props: { iz: 24662.2, welY: 2345.88, welZ: 1110.39, wplY: 4232.08, wplZ: 2055.97, avZ: 225, it: 3062.94, iw: 309659, iRadY: 14.0807, iRadZ: 8.36291 }
  },
  "L50X30X4": {
    kind: "Angle",
    naam: "L 50x30x4",
    h: 50,
    b: 30,
    tw: 4,
    tf: 4,
    r: 4.5,
    r2: 2,
    props: { iz: 21097.9, welY: 2343.87, welZ: 919.247, wplY: 4205.73, wplZ: 1691.17, avZ: 200, it: 1727.62, iw: 219815, iRadY: 15.9048, iRadZ: 8.29494 }
  },
  "L50X30X5": {
    kind: "Angle",
    naam: "L 50x30x5",
    h: 50,
    b: 30,
    tw: 5,
    tf: 5,
    r: 4.5,
    r2: 2,
    props: { iz: 25367.5, welY: 2878.92, welZ: 1124.41, wplY: 5144.9, wplZ: 2096.29, avZ: 250, it: 3270.85, iw: 408189, iRadY: 15.7832, iRadZ: 8.19608 }
  },
  "L50X40X5": {
    kind: "Angle",
    naam: "L 50x40x5",
    h: 50,
    b: 40,
    tw: 5,
    tf: 5,
    r: 4,
    r2: 2,
    props: { iz: 58895.3, welY: 3018.38, welZ: 2006.71, wplY: 5497.78, wplZ: 3634.33, avZ: 250, it: 3640.33, iw: 523284, iRadY: 15.5966, iRadZ: 11.7482 }
  },
  "L60X30X5": {
    kind: "Angle",
    naam: "L 60x30x5",
    h: 60,
    b: 30,
    tw: 5,
    tf: 5,
    r: 6,
    r2: 3,
    props: { iz: 26011.6, welY: 4043.63, welZ: 1121.78, wplY: 7133.25, wplZ: 2154.95, avZ: 300, it: 3838.19, iw: 657552, iRadY: 19.0423, iRadZ: 7.78798 }
  },
  "L60X40X5": {
    kind: "Angle",
    naam: "L 60x40x5",
    h: 60,
    b: 40,
    tw: 5,
    tf: 5,
    r: 6,
    r2: 3,
    props: { iz: 61057.9, welY: 4248.87, welZ: 2016.11, wplY: 7719.63, wplZ: 3696.24, avZ: 300, it: 4254.15, iw: 779443, iRadY: 18.944, iRadZ: 11.2919 }
  },
  "L60X40X6": {
    kind: "Angle",
    naam: "L 60x40x6",
    h: 60,
    b: 40,
    tw: 6,
    tf: 6,
    r: 6,
    r2: 3,
    props: { iz: 71200.4, welY: 5032.3, welZ: 2382.27, wplY: 9110.94, wplZ: 4398.57, avZ: 360, it: 7159.25, iw: 1295010, iRadY: 18.833, iRadZ: 11.1975 }
  },
  "L65X50X5": {
    kind: "Angle",
    naam: "L 65x50x5",
    h: 65,
    b: 50,
    tw: 5,
    tf: 5,
    r: 6,
    r2: 3,
    props: { iz: 119323, welY: 5142.85, welZ: 3185.33, wplY: 9409.54, wplZ: 5764.7, avZ: 325, it: 4877.66, iw: 1147560, iRadY: 20.4559, iRadZ: 14.6778 }
  },
  "L70X50X6": {
    kind: "Angle",
    naam: "L 70x50x6",
    h: 70,
    b: 50,
    tw: 6,
    tf: 6,
    r: 6,
    r2: 3,
    props: { iz: 142678, welY: 7042.8, welZ: 3805.46, wplY: 12811.6, wplZ: 6912.91, avZ: 420, it: 8596.31, iw: 2277830, iRadY: 22.0775, iRadZ: 14.4022 }
  },
  "L75X50X7": {
    kind: "Angle",
    naam: "L 75x50x7",
    h: 75,
    b: 50,
    tw: 7,
    tf: 7,
    r: 6.5,
    r2: 3.5,
    props: { iz: 164615, welY: 9242.35, welZ: 4386.1, wplY: 16728.7, wplZ: 8051.2, avZ: 525, it: 14069.1, iw: 4108680, iRadY: 23.6382, iRadZ: 14.0846 }
  },
  "L75X55X5": {
    kind: "Angle",
    naam: "L 75x55x5",
    h: 75,
    b: 55,
    tw: 5,
    tf: 5,
    r: 7,
    r2: 3.5,
    props: { iz: 162200, welY: 6842.83, welZ: 3885.33, wplY: 12529.1, wplZ: 7027.44, avZ: 375, it: 5629.63, iw: 1717410, iRadY: 23.741, iRadZ: 16.0423 }
  },
  "L75X55X7": {
    kind: "Angle",
    naam: "L 75x55x7",
    h: 75,
    b: 55,
    tw: 7,
    tf: 7,
    r: 7,
    r2: 3.5,
    props: { iz: 217552, welY: 9389.95, welZ: 5314.7, wplY: 17105, wplZ: 9682.66, avZ: 525, it: 14784.2, iw: 4454300, iRadY: 23.525, iRadZ: 15.8474 }
  },
  "L80X40X6": {
    kind: "Angle",
    naam: "L 80x40x6",
    h: 80,
    b: 40,
    tw: 6,
    tf: 6,
    r: 7,
    r2: 3.5,
    props: { iz: 75938.3, welY: 8728.26, welZ: 2437.24, wplY: 15377.2, wplZ: 4609.84, avZ: 480, it: 8781.2, iw: 2789440, iRadY: 25.5281, iRadZ: 10.4964 }
  },
  "L80X40X8": {
    kind: "Angle",
    naam: "L 80x40x8",
    h: 80,
    b: 40,
    tw: 8,
    tf: 8,
    r: 7,
    r2: 3.5,
    props: { iz: 96107, welY: 11385.6, welZ: 3164.93, wplY: 19927.1, wplZ: 6144.12, avZ: 640, it: 19972.8, iw: 6159990, iRadY: 25.2829, iRadZ: 10.3265 }
  },
  "L80X60X7": {
    kind: "Angle",
    naam: "L 80x60x7",
    h: 80,
    b: 60,
    tw: 7,
    tf: 7,
    r: 8,
    r2: 4,
    props: { iz: 283722, welY: 10744.4, welZ: 6337.56, wplY: 19633.5, wplZ: 11535, avZ: 560, it: 16214.7, iw: 5566590, iRadY: 25.0822, iRadZ: 17.3931 }
  },
  "L80X65X8": {
    kind: "Angle",
    naam: "L 80x65x8",
    h: 80,
    b: 65,
    tw: 8,
    tf: 8,
    r: 8,
    r2: 4,
    props: { iz: 401108, welY: 12315.9, welZ: 8411.25, wplY: 22496.2, wplZ: 15291.3, avZ: 640, it: 24613.7, iw: 8808290, iRadY: 24.8461, iRadZ: 19.0708 }
  },
  "L90X60X6": {
    kind: "Angle",
    naam: "L 90x60x6",
    h: 90,
    b: 60,
    tw: 6,
    tf: 6,
    r: 7,
    r2: 3.5,
    props: { iz: 257526, welY: 11723.5, welZ: 5605.76, wplY: 21268.3, wplZ: 10122.5, avZ: 540, it: 10936.2, iw: 4798030, iRadY: 28.7111, iRadZ: 17.2122 }
  },
  "L90X60X8": {
    kind: "Angle",
    naam: "L 90x60x8",
    h: 90,
    b: 60,
    tw: 8,
    tf: 8,
    r: 7,
    r2: 3.5,
    props: { iz: 329877, welY: 15346.2, welZ: 7306.56, wplY: 27728.2, wplZ: 13331.7, avZ: 720, it: 25081.8, iw: 10829100, iRadY: 28.472, iRadZ: 17.0014 }
  },
  "L100X50X6": {
    kind: "Angle",
    naam: "L 100x50x6",
    h: 100,
    b: 50,
    tw: 6,
    tf: 6,
    r: 9,
    r2: 4.5,
    props: { iz: 152567, welY: 13786.1, welZ: 3854.99, wplY: 24430.4, wplZ: 7191.33, avZ: 600, it: 11394.4, iw: 5641840, iRadY: 32.0623, iRadZ: 13.2221 }
  },
  "L100X50X8": {
    kind: "Angle",
    naam: "L 100x50x8",
    h: 100,
    b: 50,
    tw: 8,
    tf: 8,
    r: 9,
    r2: 4.5,
    props: { iz: 195370, welY: 18090.5, welZ: 5041.45, wplY: 31848.8, wplZ: 9598.43, avZ: 800, it: 25893.6, iw: 12713400, iRadY: 31.8361, iRadZ: 13.0643 }
  },
  "L100X50X10": {
    kind: "Angle",
    naam: "L 100x50x10",
    h: 100,
    b: 50,
    tw: 10,
    tf: 10,
    r: 9,
    r2: 4.5,
    props: { iz: 234321, welY: 22221, welZ: 6172.4, wplY: 38914, wplZ: 11995.6, avZ: 1e3, it: 48940.3, iw: 23438900, iRadY: 31.592, iRadZ: 12.8973 }
  },
  "L100X65X7": {
    kind: "Angle",
    naam: "L 100x65x7",
    h: 100,
    b: 65,
    tw: 7,
    tf: 7,
    r: 10,
    r2: 5,
    props: { iz: 375791, welY: 16614.5, welZ: 7534.56, wplY: 30229.1, wplZ: 13769.2, avZ: 700, it: 19765.9, iw: 10009700, iRadY: 31.7397, iRadZ: 18.3442 }
  },
  "L100X65X9": {
    kind: "Angle",
    naam: "L 100x65x9",
    h: 100,
    b: 65,
    tw: 9,
    tf: 9,
    r: 10,
    r2: 5,
    props: { iz: 466970, welY: 21046.5, welZ: 9518.8, wplY: 38106, wplZ: 17548.8, avZ: 900, it: 40488.9, iw: 20331900, iRadY: 31.5295, iRadZ: 18.168 }
  },
  "L100X75X9": {
    kind: "Angle",
    naam: "L 100x75x9",
    h: 100,
    b: 75,
    tw: 9,
    tf: 9,
    r: 10,
    r2: 5,
    props: { iz: 709656, welY: 21543.9, welZ: 12704.2, wplY: 39349.6, wplZ: 23137.1, avZ: 900, it: 42914.6, iw: 22984700, iRadY: 31.3257, iRadZ: 21.7167 }
  },
  "L120X80X8": {
    kind: "Angle",
    naam: "L 120x80x8",
    h: 120,
    b: 80,
    tw: 8,
    tf: 8,
    r: 11,
    r2: 5.5,
    props: { iz: 807599, welY: 27627.1, welZ: 13165.4, wplY: 50291.5, wplZ: 23897.6, avZ: 960, it: 35418.5, iw: 26666600, iRadY: 38.1677, iRadZ: 22.8336 }
  },
  "L120X80X10": {
    kind: "Angle",
    naam: "L 120x80x10",
    h: 120,
    b: 80,
    tw: 10,
    tf: 10,
    r: 11,
    r2: 5.5,
    props: { iz: 981139, welY: 34101.7, welZ: 16210.4, wplY: 61844.8, wplZ: 29628.9, avZ: 1200, it: 67158.7, iw: 50236500, iRadY: 37.9515, iRadZ: 22.6469 }
  },
  "L120X80X12": {
    kind: "Angle",
    naam: "L 120x80x12",
    h: 120,
    b: 80,
    tw: 12,
    tf: 12,
    r: 11,
    r2: 5.5,
    props: { iz: 1143330, welY: 40369.5, welZ: 19138.6, wplY: 72976.6, wplZ: 35243.3, avZ: 1440, it: 113237, iw: 83446200, iRadY: 37.72, iRadZ: 22.4476 }
  },
  "L130X65X8": {
    kind: "Angle",
    naam: "L 130x65x8",
    h: 130,
    b: 65,
    tw: 8,
    tf: 8,
    r: 11,
    r2: 5.5,
    props: { iz: 447690, welY: 31104.8, welZ: 8720.64, wplY: 54981.2, wplZ: 16236.8, avZ: 1040, it: 34566.1, iw: 29421700, iRadY: 41.7093, iRadZ: 17.2245 }
  },
  "L130X65X10": {
    kind: "Angle",
    naam: "L 130x65x10",
    h: 130,
    b: 65,
    tw: 10,
    tf: 10,
    r: 11,
    r2: 5.5,
    props: { iz: 541986, welY: 38391.1, welZ: 10728.3, wplY: 67541.9, wplZ: 20302.3, avZ: 1300, it: 65493.5, iw: 55294200, iRadY: 41.4745, iRadZ: 17.0565 }
  },
  "L150X75X9": {
    kind: "Angle",
    naam: "L 150x75x9",
    h: 150,
    b: 75,
    tw: 9,
    tf: 9,
    r: 10.5,
    r2: 5.5,
    props: { iz: 783166, welY: 46845.2, welZ: 13215.2, wplY: 82495.4, wplZ: 24392.8, avZ: 1350, it: 55324.7, iw: 65292600, iRadY: 48.2686, iRadZ: 20.0166 }
  },
  "L150X75X11": {
    kind: "Angle",
    naam: "L 150x75x11",
    h: 150,
    b: 75,
    tw: 11,
    tf: 11,
    r: 10.5,
    r2: 5.5,
    props: { iz: 929692, welY: 56600.4, welZ: 15904, wplY: 99325.6, wplZ: 29800.4, avZ: 1650, it: 98751.2, iw: 115393e3, iRadY: 48.0184, iRadZ: 19.8282 }
  },
  "L150X100X10": {
    kind: "Angle",
    naam: "L 150x100x10",
    h: 150,
    b: 100,
    tw: 10,
    tf: 10,
    r: 13,
    r2: 6.5,
    props: { iz: 1977520, welY: 54079.2, welZ: 25804, wplY: 98317.8, wplZ: 46745.4, avZ: 1500, it: 85676.7, iw: 102138e3, iRadY: 47.7638, iRadZ: 28.597 }
  },
  "L150X100X12": {
    kind: "Angle",
    naam: "L 150x100x12",
    h: 150,
    b: 100,
    tw: 12,
    tf: 12,
    r: 13,
    r2: 6.5,
    props: { iz: 2318690, welY: 64229.2, welZ: 30580.2, wplY: 116437, wplZ: 55715.9, avZ: 1800, it: 144700, iw: 171478e3, iRadY: 47.5413, iRadZ: 28.4032 }
  },
  "L180X90X10": {
    kind: "Angle",
    naam: "L 180x90x10",
    h: 180,
    b: 90,
    tw: 10,
    tf: 10,
    r: 14,
    r2: 7,
    props: { iz: 1512490, welY: 75111, welZ: 21158.7, wplY: 132719, wplZ: 38987.9, avZ: 1800, it: 93392.9, iw: 155656e3, iRadY: 57.9548, iRadZ: 24.022 }
  },
  "L200X100X10": {
    kind: "Angle",
    naam: "L 200x100x10",
    h: 200,
    b: 100,
    tw: 10,
    tf: 10,
    r: 15,
    r2: 7.5,
    props: { iz: 2103390, welY: 93236.9, welZ: 26334.5, wplY: 164909, wplZ: 48162.7, avZ: 2e3, it: 104543, iw: 216733e3, iRadY: 64.5548, iRadZ: 26.8201 }
  },
  "L200X100X12": {
    kind: "Angle",
    naam: "L 200x100x12",
    h: 200,
    b: 100,
    tw: 12,
    tf: 12,
    r: 15,
    r2: 7.5,
    props: { iz: 2472190, welY: 111006, welZ: 31280.2, wplY: 195677, wplZ: 57822.8, avZ: 2400, it: 176620, iw: 366082e3, iRadY: 64.3267, iRadZ: 26.6528 }
  },
  "L200X100X14": {
    kind: "Angle",
    naam: "L 200x100x14",
    h: 200,
    b: 100,
    tw: 14,
    tf: 14,
    r: 15,
    r2: 7.5,
    props: { iz: 2822430, welY: 128406, welZ: 36082.9, wplY: 225714, wplZ: 67445.8, avZ: 2800, it: 275295, iw: 567353e3, iRadY: 64.0815, iRadZ: 26.4703 }
  }
};

// src/lib/sectionResolver.ts
var TIMBER_E_MEAN = {
  C14: 7e3,
  C16: 8e3,
  C18: 9e3,
  C20: 9500,
  C22: 1e4,
  C24: 11e3,
  C27: 11500,
  C30: 12e3,
  C35: 13e3,
  GL24h: 11500,
  GL28h: 12600,
  GL32h: 14200,
  GL36h: 14700
};
var E_STAAL = 21e4;
var TIMBER_RHO_MEAN = {
  C14: 350,
  C16: 370,
  C18: 380,
  C20: 390,
  C22: 410,
  C24: 420,
  C27: 450,
  C30: 460,
  C35: 480,
  GL24h: 420,
  GL28h: 460,
  GL32h: 490,
  GL36h: 500
};
var CONCRETE_E_CM = {
  "C12/15": 27e3,
  "C16/20": 29e3,
  "C20/25": 3e4,
  "C25/30": 31e3,
  "C30/37": 33e3,
  "C35/45": 34e3,
  "C40/50": 35e3,
  "C45/55": 36e3,
  "C50/60": 37e3,
  "C55/67": 38e3,
  "C60/75": 39e3,
  "C70/85": 41e3,
  "C80/95": 42e3,
  "C90/105": 44e3
};
var RHO_BETON = 2500;
var RHO_STAAL = 7850;
var G = 9.81;
var DEFAULT_DOORSNEDE = { E: E_STAAL, A: 3877, I: 1673e4, bron: "default" };
var DoorsnedeOnbekendFout = class extends Error {
  /** De staven waar het om gaat, met per staaf de reden. */
  staven;
  constructor(bericht, staven) {
    super(bericht);
    this.name = "DoorsnedeOnbekendFout";
    this.staven = staven;
  }
};
function parseRechthoek(profiel) {
  if (!profiel) return null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/.exec(profiel);
  if (!m) return null;
  const b = parseFloat(m[1].replace(",", "."));
  const h = parseFloat(m[2].replace(",", "."));
  if (!(b > 0 && h > 0)) return null;
  return { b, h };
}
function normaliseer(naam) {
  return naam.toUpperCase().split("").filter((c) => c !== " " && c !== "-" && c !== ".").join("");
}
function betonDoorsnede(profile) {
  const uit = parseConcreteSection(profile);
  if (!uit.ok) return null;
  const d = uit.doorsnede;
  if (d.shape === "Rectangle") {
    const A2 = d.b_mm * d.h_mm;
    return { A: A2, I: d.b_mm * d.h_mm ** 3 / 12, bron: "beton-bxh" };
  }
  const bF = d.b_mm;
  const hF = d.h_f_mm ?? 0;
  const bW = d.b_w_mm ?? 0;
  const hW = d.h_mm - hF;
  const aF = bF * hF;
  const aW = bW * hW;
  const A = aF + aW;
  if (!(A > 0)) return null;
  const zF = hW + hF / 2;
  const zW = hW / 2;
  const zG = (aF * zF + aW * zW) / A;
  const I = bF * hF ** 3 / 12 + aF * (zF - zG) ** 2 + bW * hW ** 3 / 12 + aW * (zW - zG) ** 2;
  return { A, I, bron: "beton-vorm" };
}
function eVanMateriaal(material) {
  const vrij = parseVrijMateriaal(material);
  if (vrij) return { E: vrij.eMod, soort: "vrij" };
  const mat = material;
  if (mat in CONCRETE_E_CM) return { E: CONCRETE_E_CM[mat], soort: "beton" };
  const isHout = SUPPORTED_TIMBER_GRADES.includes(mat) || mat in TIMBER_E_MEAN;
  if (isHout) return { E: TIMBER_E_MEAN[mat] ?? 11e3, soort: "hout" };
  return { E: E_STAAL, soort: "staal" };
}
function voorbeeldProfiel(soort) {
  switch (soort) {
    case "hout":
      return 'een rechthoek als "96x450", een kruislaaghoutopbouw of een eigen doorsnede uit de profieleditor';
    case "beton":
      return 'een rechthoek als "300x500", een T of L als "T 400x450 bw=200 hf=50", of een eigen doorsnede uit de profieleditor';
    case "vrij":
      return 'een rechthoek als "100x200", een catalogusprofiel als "HEA 200" of een eigen doorsnede uit de profieleditor';
    case "staal":
      return 'een catalogusprofiel als "HEA 200" of een eigen doorsnede uit de profieleditor';
  }
}
function resolveSection(material, profile) {
  if (material === void 0 || material.trim() === "") {
    return {
      ...DEFAULT_DOORSNEDE,
      reden: "er is geen materiaal toegewezen \u2014 kies een staalsoort, houtklasse, betonklasse of vrij materiaal; een staaf zonder materiaal wordt niet als S235 aangenomen"
    };
  }
  const mat = material;
  const { E, soort } = eVanMateriaal(material);
  if (isEigenProfiel(profile)) {
    const eigen = zoekEigenDoorsnede(profile);
    if (eigen) {
      return {
        E,
        A: eigen.eigenschappen.area_mm2,
        I: eigen.eigenschappen.iy_mm4,
        bron: "eigen"
      };
    }
    return {
      ...DEFAULT_DOORSNEDE,
      reden: `eigen doorsnede "${eigenNaamVan(profile)}" is niet (meer) bewaard \u2014 open de profieleditor en bewaar hem opnieuw, of kies een ander profiel`
    };
  }
  if (soort === "vrij") {
    const rect = parseRechthoek(profile);
    if (rect) {
      const { b, h } = rect;
      return { E, A: b * h, I: b * h * h * h / 12, bron: "vrij" };
    }
    const sec = STEEL_SECTIONS[normaliseer(profile ?? "")];
    if (sec) return { E, A: sec.A, I: sec.Iy, bron: "vrij" };
  } else if (soort === "beton") {
    const vorm = betonDoorsnede(profile);
    if (vorm) return { E, A: vorm.A, I: vorm.I, bron: vorm.bron };
  } else if (soort === "hout") {
    if (isCltProfiel(profile)) {
      const layup = parseCltProfiel(profile, mat);
      const d = layup ? cltSolverDoorsnede(layup, (k) => TIMBER_E_MEAN[k]) : null;
      if (d) return { E: d.E, A: d.A, I: d.I, bron: "clt", aBruto: d.aBruto };
    }
    const rect = parseRechthoek(profile);
    if (rect) {
      const { b, h } = rect;
      return { E, A: b * h, I: b * h * h * h / 12, bron: "hout-bxh" };
    }
  } else {
    const sec = STEEL_SECTIONS[normaliseer(profile ?? "")];
    if (sec) return { E, A: sec.A, I: sec.Iy, bron: "staal-db" };
  }
  return {
    ...DEFAULT_DOORSNEDE,
    reden: profile ? `profiel "${profile}" hoort niet bij materiaal "${mat}" \u2014 verwacht ${voorbeeldProfiel(soort)}` : `er is geen profiel toegewezen \u2014 kies ${voorbeeldProfiel(soort)}`
  };
}
function doorsnedeVoorSolver(material, profile, beamId) {
  const sec = resolveSection(material, profile);
  if (sec.bron !== "default") return sec;
  const reden = sec.reden ?? "doorsnede onbekend";
  const waar = beamId === void 0 ? "Een staaf" : `Staaf ${beamId}`;
  throw new DoorsnedeOnbekendFout(
    `${waar}: ${reden}. De berekening is gestopt \u2014 doorrekenen met een vervangende doorsnede zou een antwoord geven bij een ander model.`,
    [{ beamId: beamId ?? -1, reden }]
  );
}
function onbekendeDoorsneden(staven) {
  const uit = [];
  for (const b of staven) {
    const sec = resolveSection(b.material, b.profile);
    if (sec.bron === "default") {
      uit.push({ beamId: b.id, reden: sec.reden ?? "doorsnede onbekend" });
      continue;
    }
    const verloop = bepaalVerloop(b.material, b.profile, b.profileEnd);
    if (verloop.status === "fout") uit.push({ beamId: b.id, reden: verloop.reden });
  }
  return uit;
}
function eigenGewichtPerMeter(material, profile) {
  const { A, aBruto } = resolveSection(material, profile);
  return eigenGewichtVanDoorsnede(material, aBruto ?? A);
}
function dichtheidVanMateriaal(material) {
  const mat = material ?? "S235";
  const vrij = parseVrijMateriaal(material);
  return vrij?.dichtheid ?? TIMBER_RHO_MEAN[mat] ?? (mat in CONCRETE_E_CM ? RHO_BETON : RHO_STAAL);
}
function eigenGewichtVanDoorsnede(material, A_mm2) {
  return -(dichtheidVanMateriaal(material) * (A_mm2 * 1e-6) * G) / 1e3;
}
function rechthoekGrootheden(m) {
  return { A: m.b * m.h, I: m.b * m.h ** 3 / 12 };
}
function gelastIGrootheden(m) {
  const tw = m.tw ?? 0;
  const tf = m.tf ?? 0;
  const hw = m.h - 2 * tf;
  return {
    A: 2 * m.b * tf + hw * tw,
    I: (m.b * m.h ** 3 - (m.b - tw) * hw ** 3) / 12
  };
}
function matenOpPositie(v, t) {
  const s = Math.min(1, Math.max(0, t));
  const lin = (a, b) => a + (b - a) * s;
  const uit = { b: lin(v.begin.b, v.eind.b), h: lin(v.begin.h, v.eind.h) };
  if (v.begin.tw !== void 0 && v.eind.tw !== void 0) uit.tw = lin(v.begin.tw, v.eind.tw);
  if (v.begin.tf !== void 0 && v.eind.tf !== void 0) uit.tf = lin(v.begin.tf, v.eind.tf);
  return uit;
}
function doorsnedeOpPositie(v, t) {
  const maten = matenOpPositie(v, t);
  const g = v.soort === "rechthoek" ? rechthoekGrootheden(maten) : gelastIGrootheden(maten);
  return { ...g, maten };
}
function soortNaam(kind) {
  switch (kind) {
    case "Shs":
    case "Rhs":
      return "koker";
    case "Chs":
      return "buis";
    case "Angle":
      return "hoeklijn";
    case "Channel":
      return "U-profiel";
    default:
      return kind;
  }
}
function bepaalVerloop(material, profile, profileEnd) {
  const eind = profileEnd?.trim() ?? "";
  if (eind === "") return { status: "prismatisch" };
  const beginNaam = profile?.trim() ?? "";
  if (eind === beginNaam) return { status: "prismatisch" };
  if (material === void 0 || material.trim() === "") {
    return {
      status: "fout",
      reden: "er is geen materiaal toegewezen, dus ook geen verlopend profiel"
    };
  }
  const { E, soort } = eVanMateriaal(material);
  const nietOndersteund = (wat) => ({
    status: "fout",
    reden: `verlopend profiel wordt voor deze doorsnede niet ondersteund (${wat}) \u2014 alleen een rechthoek b\xD7h of een I/H-profiel uit de staalcatalogus kan verlopen`
  });
  if (soort === "beton") return nietOndersteund("beton");
  if (isEigenProfiel(profile) || isEigenProfiel(eind)) return nietOndersteund("eigen doorsnede");
  if (isCltProfiel(profile) || isCltProfiel(eind)) return nietOndersteund("kruislaaghout");
  const rB = parseRechthoek(profile);
  const rE = parseRechthoek(eind);
  if (rB && rE) {
    if (rB.b === rE.b && rB.h === rE.h) return { status: "prismatisch" };
    return {
      status: "verlopend",
      verloop: { soort: "rechthoek", E, begin: { b: rB.b, h: rB.h }, eind: { b: rE.b, h: rE.h } }
    };
  }
  if (soort === "hout") {
    if (!rB) return nietOndersteund(`"${profile}"`);
    return {
      status: "fout",
      reden: `eindprofiel "${eind}" is geen rechthoek zoals beginprofiel "${profile}" \u2014 beide profielen van een verlopende houten staaf moeten een rechthoek b\xD7h zijn`
    };
  }
  if (rB || rE) {
    return {
      status: "fout",
      reden: `beginprofiel "${profile}" en eindprofiel "${eind}" zijn niet van dezelfde doorsnedesoort \u2014 een verlopende staaf gaat van rechthoek naar rechthoek of van I/H-profiel naar I/H-profiel`
    };
  }
  const dB = STEEL_SECTION_DIMS[normaliseer(profile ?? "")];
  const dE = STEEL_SECTION_DIMS[normaliseer(eind)];
  if (!dB) {
    return nietOndersteund(`"${profile}"`);
  }
  if (!dE) {
    return {
      status: "fout",
      reden: `eindprofiel "${eind}" is niet bekend in de staalcatalogus \u2014 verwacht een I/H-profiel zoals beginprofiel "${dB.naam}"`
    };
  }
  if (dB.kind !== "ISection" || dE.kind !== "ISection") {
    const wat = dB.kind !== "ISection" ? dB : dE;
    return nietOndersteund(`${soortNaam(wat.kind)} "${wat.naam}"`);
  }
  const schuin = [dB, dE].find((d) => (d.flensHelling ?? 0) > 0);
  if (schuin) {
    return nietOndersteund(`I-profiel met toelopende flenzen "${schuin.naam}"`);
  }
  if (dB === dE) return { status: "prismatisch" };
  return {
    status: "verlopend",
    verloop: {
      soort: "gelastI",
      E,
      begin: { b: dB.b, h: dB.h, tw: dB.tw, tf: dB.tf },
      eind: { b: dE.b, h: dE.h, tw: dE.tw, tf: dE.tf }
    }
  };
}

// src/lib/thermalAlpha.ts
var ALPHA_STAAL = 12e-6;
var ALPHA_HOUT = 5e-6;
function thermalAlphaForMaterial(material) {
  return material !== void 0 && material in TIMBER_E_MEAN ? ALPHA_HOUT : ALPHA_STAAL;
}

// src/lib/betonZoneSneden.ts
var ZONE_TOLERANTIE_MM = 1e-6;
function zoneGrenzenMm(zones) {
  if (!zones) return [];
  const ruw = [
    ...zones.longitudinal.flatMap((z) => [z.x_start_mm, z.x_end_mm]),
    ...zones.stirrups.flatMap((z) => [z.x_start_mm, z.x_end_mm])
  ].filter((x) => Number.isFinite(x));
  ruw.sort((a, b) => a - b);
  const uit = [];
  for (const x of ruw) {
    if (uit.length === 0 || Math.abs(x - uit[uit.length - 1]) > ZONE_TOLERANTIE_MM) uit.push(x);
  }
  return uit;
}
function zoneSnedeFracties(zones, lengteMm) {
  if (!(lengteMm > 0)) return [];
  return zoneGrenzenMm(zones).filter((x) => x > ZONE_TOLERANTIE_MM && x < lengteMm - ZONE_TOLERANTIE_MM).map((x) => x / lengteMm);
}
function zoneSnedenUitStaven(beams, nodes) {
  const knoop = new Map(nodes.map((n) => [n.id, n]));
  const uit = /* @__PURE__ */ new Map();
  for (const b of beams) {
    const zones = b.checkConfig?.betonZones;
    if (!zones || zones.longitudinal.length === 0 && zones.stirrups.length === 0) continue;
    const a = knoop.get(b.from);
    const c = knoop.get(b.to);
    if (!a || !c) continue;
    const fracties = zoneSnedeFracties(zones, Math.hypot(c.x - a.x, c.z - a.z));
    if (fracties.length > 0) uit.set(b.id, fracties);
  }
  return uit;
}

// src/lib/modelNaarSolverInput.ts
function verenNaarCanoniek(v) {
  if (!v) return {};
  const uit = {};
  for (const k of ["startTx", "startTz", "endTx", "endTz"]) {
    if (v[k] !== void 0 && v[k] > 0) uit[k] = v[k] * 1e3;
  }
  for (const k of ["startRy", "endRy"]) {
    if (v[k] !== void 0 && v[k] > 0) uit[k] = v[k] * 1e6;
  }
  return Object.keys(uit).length > 0 ? { veren: uit } : {};
}
function liftSpringK(s) {
  if (s.k === void 0) return void 0;
  if (s.type === "zSpring" || s.type === "xSpring") return s.k * 1e3;
  if (s.type === "rotSpring") return s.k * 1e6;
  return void 0;
}
function controleerDoorsneden(beams, opties = {}) {
  const lijst = Array.from(beams);
  const onbekend = onbekendeDoorsneden(lijst);
  if (onbekend.length === 0) {
    if (!opties.heeftPlaten) return;
    const verlopend = lijst.filter(
      (b) => bepaalVerloop(b.material, b.profile, b.profileEnd).status === "verlopend"
    );
    if (verlopend.length === 0) return;
    const reden = "een verlopend profiel wordt in een model met platen nog niet ondersteund \u2014 maak de staaf prismatisch (verwijder het eindprofiel) of haal de platen uit het model";
    throw new DoorsnedeOnbekendFout(
      `De berekening is gestopt: ${verlopend.length === 1 ? "staaf" : "staven"} ${verlopend.map((b) => b.id).join(", ")} ${verlopend.length === 1 ? "heeft" : "hebben"} een verlopend profiel en het model bevat platen; ${reden}.`,
      verlopend.map((b) => ({ beamId: b.id, reden }))
    );
  }
  const eerste = onbekend.slice(0, 5).map((o) => `staaf ${o.beamId}: ${o.reden}`);
  const rest = onbekend.length - eerste.length;
  throw new DoorsnedeOnbekendFout(
    `De berekening is gestopt: van ${onbekend.length} ${onbekend.length === 1 ? "staaf is" : "staven is"} de doorsnede niet te bepalen. ${eerste.join("; ")}` + (rest > 0 ? `; en nog ${rest} andere` : "") + ". Doorrekenen met een vervangende doorsnede zou een antwoord geven bij een ander model dan is ingevoerd.",
    onbekend
  );
}
var VERLOOP_SEGMENTEN = 20;
function aantalVerloopSegmenten(L_mm, aantal = VERLOOP_SEGMENTEN) {
  if (!(L_mm > 0)) return 1;
  return Math.max(1, Math.min(aantal, Math.floor(L_mm / MIN_SEGMENT_MM)));
}
function segmentenVoorVerloop(verloop, L_mm, aantal = VERLOOP_SEGMENTEN) {
  const n = aantalVerloopSegmenten(L_mm, aantal);
  const uit = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const d = doorsnedeOpPositie(verloop, (t0 + t1) / 2);
    uit.push({ tStart: t0, tEnd: t1, I: d.I, A: d.A });
  }
  return uit;
}
function staafLengteMm(b, nodes) {
  let nA;
  let nB;
  for (const n of nodes) {
    if (n.id === b.from) nA = n;
    if (n.id === b.to) nB = n;
  }
  return nA && nB ? Math.hypot(nB.x - nA.x, nB.z - nA.z) : 0;
}
function doorsnedeVeldenVoorSolver(b, L_mm) {
  const verloop = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (verloop.status === "fout") {
    throw new DoorsnedeOnbekendFout(
      `Staaf ${b.id}: ${verloop.reden}. De berekening is gestopt.`,
      [{ beamId: b.id, reden: verloop.reden }]
    );
  }
  if (verloop.status === "prismatisch") {
    const sec = resolveSection(b.material, b.profile);
    return { E: sec.E, A: sec.A, I: sec.I };
  }
  const v = verloop.verloop;
  const midden = doorsnedeOpPositie(v, 0.5);
  return { E: v.E, A: midden.A, I: midden.I, segmenten: segmentenVoorVerloop(v, L_mm) };
}
function eigenGewichtLasten(b, L_mm, caseId) {
  const verloop = bepaalVerloop(b.material, b.profile, b.profileEnd);
  if (verloop.status !== "verlopend") {
    const q = eigenGewichtPerMeter(b.material, b.profile);
    return Math.abs(q) > 1e-9 ? [{ beamId: b.id, q, caseId }] : [];
  }
  return segmentenVoorVerloop(verloop.verloop, L_mm).map((s) => ({
    beamId: b.id,
    q: eigenGewichtVanDoorsnede(b.material, s.A),
    startFrac: s.tStart,
    endFrac: s.tEnd,
    caseId
  }));
}
function plaatNaarSolverInput(p) {
  const d = withPlateDefaults(p);
  return {
    id: d.id,
    nodeIds: d.nodeIds,
    thickness: d.thickness,
    E: d.E,
    nu: d.nu,
    rho: d.rho,
    meshSize: d.meshSize,
    // Alleen aanwezig als er een cache is: een rechthoek draagt er geen, en
    // dan blijft de invoer van zo'n model byte-gelijk aan voorheen.
    ...d.meshCache ? { meshCache: d.meshCache } : {}
  };
}
function randlastNaarSolverInput(l) {
  if (l.type !== "edgeLoad" || l.plateId === void 0 || l.q === void 0) return null;
  return {
    plateId: l.plateId,
    ...l.edge !== void 0 ? { edge: l.edge } : {},
    ...l.edgeIndex !== void 0 ? { edgeIndex: l.edgeIndex } : {},
    p: l.q,
    // Deellast en trapezium: dezelfde velden en dezelfde betekenis als bij een
    // staaf, maar langs de rand vanaf de beginhoek. Alleen aanwezig als ze
    // ingevoerd zijn, zodat een volle gelijkmatige randlast byte-gelijk blijft.
    ...l.qStart !== void 0 ? { pStart: l.qStart } : {},
    ...l.qEnd !== void 0 ? { pEnd: l.qEnd } : {},
    ...l.startFrac !== void 0 ? { startFrac: l.startFrac } : {},
    ...l.endFrac !== void 0 ? { endFrac: l.endFrac } : {},
    dir: l.qDir
  };
}
function randpuntlastNaarSolverInput(l) {
  if (l.type !== "pointForce" || l.plateId === void 0) return null;
  return {
    plateId: l.plateId,
    ...l.edge !== void 0 ? { edge: l.edge } : {},
    ...l.edgeIndex !== void 0 ? { edgeIndex: l.edgeIndex } : {},
    posFrac: l.posFrac,
    fx: (l.fx ?? 0) * 1e3,
    fz: (l.fz ?? 0) * 1e3
  };
}
function bouwMultiInput(model) {
  controleerDoorsneden(model.beams, { heeftPlaten: model.plates.length > 0 });
  const zoneSneden = zoneSnedenUitStaven(model.beams, model.nodes);
  const multiInput = {
    nodes: model.nodes.map((n) => ({ id: n.id, x: n.x, z: n.z })),
    beams: model.beams.map((b) => {
      const sneden = zoneSneden.get(b.id);
      return {
        id: b.id,
        from: b.from,
        to: b.to,
        ...doorsnedeVeldenVoorSolver(b, staafLengteMm(b, model.nodes)),
        // Releases naar de engine: buigscharnieren via het legacy paar,
        // en het volledige object (mét Tx/Tz-hulzen in lokale assen)
        // ernaast — de engine kiest zelf het rijkere per-DOF-model zodra
        // er een translatie-release in zit.
        startConnection: b.releases?.startRy ? "hinge" : "fixed",
        endConnection: b.releases?.endRy ? "hinge" : "fixed",
        releases: b.releases,
        // Verende aansluitingen: UI kN/mm → N/mm (×1e3), kNm/rad → N·mm/rad
        // (×1e6). Alleen aanwezig als er echt een veer > 0 is opgegeven.
        ...verenNaarCanoniek(b.veren),
        // Alleen aanwezig als er werkelijk zonegrenzen zijn; een leeg veld zou
        // de invoer van een model zonder beton onnodig veranderen.
        ...sneden && sneden.length > 0 ? { extraSneden: sneden } : {},
        // Bedding: k [kN/m³] · b [mm] → lijnstijfheid in N/mm². 1 kN/m³ =
        // 1e3 N / 1e9 mm³ = 1e-6 N/mm³. Alleen aanwezig als er een bedding is.
        ...b.bedding && b.bedding.k > 0 && b.bedding.b > 0 ? { bedding: { kLijn: b.bedding.k * 1e-6 * b.bedding.b } } : {}
      };
    }),
    supports: model.supports.map((s) => ({ nodeId: s.nodeId, type: s.type, k: liftSpringK(s) })),
    // Platen (wandschijven, P2.3): rekenvelden met defaults aangevuld plus de
    // meshcache — de engine meshet en schakelt zelf naar mixed_beam_plate.
    plates: model.plates.map(plaatNaarSolverInput),
    cases: model.loadCases.map((lc) => ({ id: lc.id, name: lc.name })),
    loads: [],
    pointLoads: [],
    beamPointLoads: [],
    thermalLoads: [],
    edgeLoads: [],
    // Scheefstand: φ = 1/noemer, richting ±x — de engine geeft elke
    // verticale last een horizontale metgezel H = φ·V.
    scheefstand: model.scheefstandEnabled ? { phi: 1 / model.scheefstandNoemer, richting: model.scheefstandRichting } : void 0
  };
  if (model.selfWeightEnabled) {
    const deadCase = model.loadCases.find((c) => c.type === "dead");
    if (deadCase) {
      for (const b of model.beams) {
        multiInput.loads.push(...eigenGewichtLasten(b, staafLengteMm(b, model.nodes), deadCase.id));
      }
      for (const p of multiInput.plates ?? []) p.selfWeightCaseId = deadCase.id;
    }
  }
  for (const l of model.loads) {
    if (l.type === "lineLoad" && l.beamId !== void 0 && l.q !== void 0) {
      multiInput.loads.push({
        beamId: l.beamId,
        q: l.q,
        qStart: l.qStart,
        qEnd: l.qEnd,
        qDir: l.qDir,
        qCoord: l.qCoord,
        startFrac: l.startFrac,
        endFrac: l.endFrac,
        caseId: l.caseId
      });
    } else if (l.type === "pointForce" && l.plateId !== void 0) {
      const rp = randpuntlastNaarSolverInput(l);
      (multiInput.edgePointLoads ??= []).push({ ...rp, caseId: l.caseId });
    } else if (l.type === "pointForce" && l.nodeId !== void 0) {
      multiInput.pointLoads.push({
        nodeId: l.nodeId,
        fx: (l.fx ?? 0) * 1e3,
        fz: (l.fz ?? 0) * 1e3,
        caseId: l.caseId
      });
    } else if (l.type === "pointForce" && l.beamId !== void 0) {
      multiInput.beamPointLoads.push({
        beamId: l.beamId,
        posFrac: Math.min(1, Math.max(0, l.posFrac ?? 0)),
        fx: (l.fx ?? 0) * 1e3,
        fz: (l.fz ?? 0) * 1e3,
        caseId: l.caseId
      });
    } else if (l.type === "pointMoment" && l.nodeId !== void 0) {
      multiInput.pointLoads.push({
        nodeId: l.nodeId,
        my: (l.my ?? 0) * 1e6,
        caseId: l.caseId
      });
    } else if (l.type === "thermal" && l.beamId !== void 0 && l.deltaT !== void 0) {
      const beam = model.beams.find((b) => b.id === l.beamId);
      multiInput.thermalLoads.push({
        beamId: l.beamId,
        deltaT: l.deltaT,
        alpha: thermalAlphaForMaterial(beam?.material),
        caseId: l.caseId
      });
    } else if (l.type === "edgeLoad") {
      const rl = randlastNaarSolverInput(l);
      if (rl) multiInput.edgeLoads.push({ ...rl, caseId: l.caseId });
    }
  }
  return multiInput;
}

// src/lib/normenInRapport.ts
function leeg() {
  return { en1993: false, en1995: false, en1992: false };
}
function normVanMateriaal(soort) {
  switch (soort) {
    case "staal":
      return "en1993";
    case "hout":
    case "clt":
      return "en1995";
    case "beton":
      return "en1992";
    default:
      return null;
  }
}
function normenInModel(beams) {
  const uit = leeg();
  for (const beam of beams) {
    const norm = normVanMateriaal(materiaalVanStaaf(beam));
    if (norm !== null) uit[norm] = true;
  }
  return uit;
}

// src/lib/scheefstandNorm.ts
var SCHEEFSTAND_BRONNEN = [
  "vast",
  "en1993",
  "en1992",
  "en1995",
  "ongunstigste"
];
var SCHEEFSTAND_NORMEN = ["en1993", "en1992", "en1995"];
var SCHEEFSTAND_BRON_LABEL = {
  vast: "vaste noemer",
  en1993: "EN 1993-1-1 (5.5)",
  en1992: "EN 1992-1-1 (5.1)",
  en1995: "EN 1995-1-1 (5.1)",
  ongunstigste: "ongunstigste van toepassing"
};
var VERTICAAL_VANAF_GRADEN2 = 75;
function getal3(x, decimalen) {
  return x.toFixed(decimalen).replace(".", ",");
}
function leidScheefstandGeometrieAf(model) {
  const afleiding = [];
  const knoopById = new Map(model.nodes.map((n) => [n.id, n]));
  const alleZ = model.nodes.map((n) => n.z);
  const topZ = alleZ.length > 0 ? Math.max(...alleZ) : 0;
  const opleggingZ = model.supports.map((s) => knoopById.get(s.nodeId)?.z).filter((z) => typeof z === "number");
  const heeftOpleggingen = opleggingZ.length > 0;
  const voetZ = heeftOpleggingen ? Math.min(...opleggingZ) : alleZ.length > 0 ? Math.min(...alleZ) : 0;
  const hoogteM = Math.max(0, (topZ - voetZ) / 1e3);
  afleiding.push(
    `h = ${getal3(hoogteM, 3)} m \u2014 van de voet (${heeftOpleggingen ? `laagste oplegging, z = ${getal3(voetZ, 0)} mm` : `geen opleggingen in het model, dus de laagste knoop, z = ${getal3(voetZ, 0)} mm`}) tot de bovenkant van de constructie (z = ${getal3(topZ, 0)} mm). EN 1993-1-1 figuur 5.2 meet h vanaf het opleggingsniveau; EN 1992-1-1 \xA75.2(6) noemt het voor de schorende constructie de hoogte van het gebouw.`
  );
  const minSinus = Math.sin(VERTICAAL_VANAF_GRADEN2 * Math.PI / 180);
  const verticaal = [];
  for (const b of model.beams) {
    const a = knoopById.get(b.from);
    const c = knoopById.get(b.to);
    if (!a || !c) continue;
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-9) continue;
    if (Math.abs(dz) / L >= minSinus) verticaal.push({ id: b.id, from: b.from, to: b.to });
  }
  const ouder = /* @__PURE__ */ new Map();
  const wortel = (x) => {
    let r = x;
    while (ouder.get(r) !== r) r = ouder.get(r);
    let k = x;
    while (ouder.get(k) !== r) {
      const volgende = ouder.get(k);
      ouder.set(k, r);
      k = volgende;
    }
    return r;
  };
  for (const b of verticaal) {
    for (const n of [b.from, b.to]) if (!ouder.has(n)) ouder.set(n, n);
  }
  for (const b of verticaal) {
    const ra = wortel(b.from);
    const rb = wortel(b.to);
    if (ra !== rb) ouder.set(ra, rb);
  }
  const perWortel = /* @__PURE__ */ new Map();
  for (const b of verticaal) {
    const r = wortel(b.from);
    const lijst = perWortel.get(r);
    if (lijst) lijst.push(b.id);
    else perWortel.set(r, [b.id]);
  }
  const kolomlijnen = [];
  for (const staafIds of perWortel.values()) {
    const knopen = /* @__PURE__ */ new Set();
    for (const id of staafIds) {
      const b = verticaal.find((v) => v.id === id);
      knopen.add(b.from);
      knopen.add(b.to);
    }
    const pts = [...knopen].map((n) => knoopById.get(n)).filter((n) => !!n);
    if (pts.length === 0) continue;
    const voet = pts.reduce((laagste, p) => p.z < laagste.z ? p : laagste, pts[0]);
    kolomlijnen.push({
      staafIds: [...staafIds].sort((a, b) => a - b),
      voetZmm: voet.z,
      topZmm: Math.max(...pts.map((p) => p.z)),
      voetXmm: voet.x
    });
  }
  kolomlijnen.sort((a, b) => a.voetXmm - b.voetXmm || a.voetZmm - b.voetZmm);
  const aantalElementen = Math.max(1, kolomlijnen.length);
  if (kolomlijnen.length === 0) {
    afleiding.push(
      `m = 1 (terugval) \u2014 dit model bevat geen enkele staaf die steiler staat dan ${VERTICAAL_VANAF_GRADEN2}\xB0 met de horizontaal, dus er is geen kolomlijn te tellen. m = 1 geeft \u03B1_m = 1,00: de grootste waarde die de formule kan aannemen, en dus de veilige terugval.`
    );
  } else {
    afleiding.push(
      `m = ${aantalElementen} \u2014 ${aantalElementen} kolomlijn${aantalElementen === 1 ? "" : "en"}: ` + kolomlijnen.map(
        (k, i) => `(${i + 1}) x = ${getal3(k.voetXmm, 0)} mm, staaf ${k.staafIds.join("+")}`
      ).join("; ") + `. Een staaf telt als verticaal vanaf ${VERTICAAL_VANAF_GRADEN2}\xB0 met de horizontaal; staven die een knoop delen vormen samen \xE9\xE9n kolom, zodat een kolom door meerdere verdiepingen \xE9\xE9nmaal telt.`
    );
  }
  afleiding.push(
    "LET OP bij m: EN 1993-1-1 5.3.2(3)a telt alleen kolommen mee die minstens 50 % van de gemiddelde verticale kolomkracht dragen. Die krachten volgen uit de berekening en de berekening heeft \u03C6 nodig, dus dat criterium is hier niet toegepast \u2014 \xE1lle kolomlijnen tellen mee. Een licht belaste stijl hoort er met de hand uit: kleinere m geeft grotere \u03B1_m en dus grotere \u03C6, de veilige kant."
  );
  afleiding.push(
    "Wandschijven tellen niet mee in m: een schijf schoort meestal in plaats van geschoord te worden, en meetellen zou m verhogen en \u03C6 verlagen. Draagt een wand hier w\xE9l verticaal mee, verhoog m dan met de hand."
  );
  return {
    hoogteM,
    aantalElementen,
    kolomlijnen,
    afleidbaar: kolomlijnen.length > 0 && hoogteM > 0,
    afleiding
  };
}
function alphaH(hoogteM) {
  const ruw = hoogteM > 0 ? 2 / Math.sqrt(hoogteM) : Number.POSITIVE_INFINITY;
  if (ruw > 1) return { waarde: 1, begrensd: "boven" };
  if (ruw < 2 / 3) return { waarde: 2 / 3, begrensd: "onder" };
  return { waarde: ruw, begrensd: null };
}
function alphaM(aantalElementen) {
  const m = Math.max(1, Math.floor(aantalElementen));
  return Math.sqrt(0.5 * (1 + 1 / m));
}
var BASISWAARDE = {
  en1993: {
    waarde: 1 / 200,
    noemer: 200,
    artikel: "EN 1993-1-1 \xA75.3.2(3)a",
    uitleg: "\u03C6\u2080 is de basiswaarde: \u03C6\u2080 = 1/200."
  },
  en1992: {
    waarde: 1 / 300,
    noemer: 300,
    artikel: "EN 1992-1-1 \xA75.2(5) + NB",
    uitleg: "\u03B8\u2080 is de basiswaarde. De Nederlandse nationale bijlage haalt de aanbevolen EN-waarde 1/200 door en schrijft 1/300 voor."
  },
  en1995: {
    waarde: 5e-3,
    noemer: 200,
    artikel: "EN 1995-1-1 \xA75.4.4(2)",
    uitleg: "\u03C6 = 0,005 rad voor h \u2264 5 m; deze norm kent geen losse basiswaarde."
  }
};
function phiVolgensNorm(norm, hoogteM, aantalElementen) {
  const h = Number.isFinite(hoogteM) && hoogteM > 0 ? hoogteM : 0;
  const m = Math.max(1, Math.floor(Number.isFinite(aantalElementen) ? aantalElementen : 1));
  const basis = BASISWAARDE[norm];
  const regels = [];
  if (norm === "en1995") {
    const phi2 = h > 5 ? 5e-3 * Math.sqrt(5 / h) : 5e-3;
    regels.push({
      symbool: "h",
      waarde: `${getal3(h, 3)} m`,
      artikel: "EN 1995-1-1 \xA75.4.4(2)",
      uitleg: "de hoogte van de constructie of de lengte van het element, in m."
    });
    regels.push({
      symbool: "\u03C6",
      waarde: `${getal3(phi2, 5)} rad = 1/${getal3(1 / phi2, 0)}`,
      artikel: "EN 1995-1-1 (5.1)",
      uitleg: h > 5 ? `h > 5 m, dus \u03C6 = 0,005\xB7\u221A(5/h) = 0,005\xB7\u221A(5/${getal3(h, 3)}).` : "h \u2264 5 m, dus \u03C6 = 0,005 rad. Deze norm kent geen \u03B1_m en geen ondergrens op de hoogtereductie."
    });
    return { norm, phi: phi2, regels };
  }
  const ah = alphaH(h);
  const am = alphaM(m);
  const phi = basis.waarde * ah.waarde * am;
  const symbool = norm === "en1992" ? "\u03B8" : "\u03C6";
  const artikelFormule = norm === "en1992" ? "EN 1992-1-1 (5.1)" : "EN 1993-1-1 (5.5)";
  regels.push({
    symbool: `${symbool}\u2080`,
    waarde: `1/${basis.noemer} = ${getal3(basis.waarde, 5)}`,
    artikel: basis.artikel,
    uitleg: basis.uitleg
  });
  regels.push({
    symbool: "h",
    waarde: `${getal3(h, 3)} m`,
    artikel: artikelFormule,
    uitleg: norm === "en1992" ? "l is de hoogte van het gebouw; \xA75.2(6), geval 'effect op de schorende constructie'." : "h is de hoogte van de constructie, in meter (figuur 5.2)."
  });
  regels.push({
    symbool: "\u03B1_h",
    waarde: getal3(ah.waarde, 4),
    artikel: artikelFormule,
    uitleg: `\u03B1_h = 2/\u221Ah = 2/\u221A${getal3(h, 3)}` + (ah.begrensd === "boven" ? " en wordt begrensd door de bovengrens 1,0." : ah.begrensd === "onder" ? " en wordt begrensd door de ondergrens 2/3." : ", binnen 2/3 \u2264 \u03B1_h \u2264 1,0.")
  });
  regels.push({
    symbool: "m",
    waarde: String(m),
    artikel: artikelFormule,
    uitleg: norm === "en1992" ? "m is het aantal verticale elementen dat bijdraagt aan de horizontale kracht op de schorende constructie." : "m is het aantal kolommen in een rij (alleen die met N_Ed \u2265 50 % van het gemiddelde)."
  });
  regels.push({
    symbool: "\u03B1_m",
    waarde: getal3(am, 4),
    artikel: artikelFormule,
    uitleg: `\u03B1_m = \u221A(0,5\xB7(1 + 1/m)) = \u221A(0,5\xB7(1 + 1/${m})).`
  });
  regels.push({
    symbool: norm === "en1992" ? "\u03B8_i" : "\u03C6",
    waarde: `${getal3(phi, 5)} rad = 1/${getal3(1 / phi, 0)}`,
    artikel: artikelFormule,
    uitleg: `${symbool}\u2080 \xB7 \u03B1_h \xB7 \u03B1_m = ${getal3(basis.waarde, 5)} \xB7 ${getal3(ah.waarde, 4)} \xB7 ${getal3(am, 4)}.`
  });
  return { norm, phi, regels };
}
function toepasselijkeScheefstandNormen(beams) {
  const vlaggen = normenInModel(beams);
  return SCHEEFSTAND_NORMEN.filter((n) => vlaggen[n]);
}
function bepaalScheefstand(keuze, geometrie, toepasselijk) {
  const noemer = Number.isFinite(keuze.noemer) && keuze.noemer > 0 ? keuze.noemer : 200;
  const bron = keuze.bron ?? "vast";
  const waarschuwingen = [];
  const vast = (extraWaarschuwing) => {
    if (extraWaarschuwing) waarschuwingen.push(extraWaarschuwing);
    return {
      phi: 1 / noemer,
      noemer,
      bron: "vast",
      norm: null,
      hoogteM: geometrie.hoogteM,
      aantalElementen: geometrie.aantalElementen,
      hoogteHandmatig: false,
      aantalHandmatig: false,
      regels: [
        {
          symbool: "\u03C6",
          waarde: `1/${getal3(noemer, 0)} = ${getal3(1 / noemer, 5)}`,
          artikel: "opgegeven waarde",
          uitleg: "Vaste noemer uit de projectinstellingen; de reductiefactoren \u03B1_h en \u03B1_m van de norm zijn NIET toegepast. Dit is de basiswaarde en daarmee de veilige bovengrens."
        }
      ],
      vergelijking: [],
      waarschuwingen
    };
  };
  if (bron === "vast") return vast();
  const hoogteHandmatig = typeof keuze.hoogteM === "number" && Number.isFinite(keuze.hoogteM) && keuze.hoogteM > 0;
  const aantalHandmatig = typeof keuze.aantalElementen === "number" && Number.isFinite(keuze.aantalElementen) && keuze.aantalElementen >= 1;
  const hoogteM = hoogteHandmatig ? keuze.hoogteM : geometrie.hoogteM;
  const aantalElementen = aantalHandmatig ? Math.floor(keuze.aantalElementen) : geometrie.aantalElementen;
  if (!geometrie.afleidbaar && !(hoogteHandmatig && aantalHandmatig)) {
    waarschuwingen.push(
      "h en/of m zijn niet uit het model af te leiden (geen verticale staaf, of geen hoogte). Controleer ze en geef ze zo nodig zelf op."
    );
  }
  if (hoogteM <= 0) {
    waarschuwingen.push(
      "De constructie heeft geen hoogte, dus \u03B1_h valt op zijn bovengrens 1,0. Een scheefstand op een vlak model is een keuze van de gebruiker en geen normvoorschrift."
    );
  }
  let normen;
  if (bron === "ongunstigste") {
    if (toepasselijk.length === 0) {
      return vast(
        `Geen van de drie normen is op dit model van toepassing (alle staven hebben een vrij of onbekend materiaal). De vaste noemer blijft gelden: \u03C6 = 1/${getal3(noemer, 0)}.`
      );
    }
    normen = toepasselijk;
  } else {
    normen = [bron];
    if (toepasselijk.length > 0 && !toepasselijk.includes(bron)) {
      waarschuwingen.push(
        `${SCHEEFSTAND_BRON_LABEL[bron]} is gekozen, maar dit model bevat geen materiaal dat onder die norm valt (wel: ${toepasselijk.map((n) => SCHEEFSTAND_BRON_LABEL[n]).join(", ")}).`
      );
    }
  }
  const vergelijking = normen.map((n) => phiVolgensNorm(n, hoogteM, aantalElementen));
  const gekozen = vergelijking.reduce((a, b) => b.phi > a.phi ? b : a);
  if (bron === "ongunstigste" && vergelijking.length > 1) {
    waarschuwingen.push(
      "Ongunstigste van " + vergelijking.map((v) => `${SCHEEFSTAND_BRON_LABEL[v.norm]} \u2192 1/${getal3(1 / v.phi, 0)}`).join(", ") + `. Gekozen: ${SCHEEFSTAND_BRON_LABEL[gekozen.norm]}.`
    );
  }
  return {
    phi: gekozen.phi,
    noemer: 1 / gekozen.phi,
    bron,
    norm: gekozen.norm,
    hoogteM,
    aantalElementen,
    hoogteHandmatig,
    aantalHandmatig,
    regels: gekozen.regels,
    vergelijking,
    waarschuwingen
  };
}

// src/io/projectFile.ts
var PROJECT_FILE_EXT = "ifcfem2d";
var PROJECT_FORMAT_VERSION = 2;
var SOORTEN = ["6.10a", "6.10b", "6.14b", "6.15b", "6.16b"];
function combinationsToFile(combos) {
  return combos.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    formula: c.formula,
    factors: Object.fromEntries([...c.factors].map(([caseId, f]) => [String(caseId), f])),
    ...c.standaard ? { standaard: { ...c.standaard } } : {}
  }));
}
function kenmerkUitBestand(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const k = raw;
  if (typeof k.sleutel !== "string") return void 0;
  if (!SOORTEN.includes(k.soort)) return void 0;
  if (!GEVOLGKLASSEN.includes(k.gevolgklasse)) return void 0;
  return {
    sleutel: k.sleutel,
    soort: k.soort,
    gevolgklasse: k.gevolgklasse
  };
}
function combinationsFromFile(raw) {
  if (!Array.isArray(raw)) return void 0;
  return raw.map((c) => {
    const standaard = kenmerkUitBestand(c.standaard);
    return {
      id: c.id,
      name: c.name,
      type: c.type === "sls" ? "sls" : "uls",
      formula: c.formula ?? "",
      factors: new Map(
        Object.entries(c.factors ?? {}).map(([caseId, f]) => [Number(caseId), Number(f)])
      ),
      ...standaard ? { standaard } : {}
    };
  });
}
function serializeProject(state) {
  const file = {
    format: "open-fem2d-studio-v2",
    version: PROJECT_FORMAT_VERSION,
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...state
  };
  return JSON.stringify(file, null, 2);
}
function deserializeProject(text) {
  const parsed = JSON.parse(text);
  if (parsed.format !== "open-fem2d-studio-v2") {
    throw new Error(`Onbekend bestandsformaat: ${parsed.format ?? "(geen format-tag)"}`);
  }
  if (typeof parsed.version !== "number") {
    throw new Error("Bestand mist version-tag");
  }
  if (parsed.version > PROJECT_FORMAT_VERSION) {
    throw new Error(`Bestand is opgeslagen met nieuwere versie (${parsed.version}) \u2014 werk je app bij`);
  }
  return parsed;
}

// package.json
var version = "0.3.11";

// src/mcp/fouten.ts
var AFBEELDINGEN = [
  // ── 1. Model: randvoorwaarden, lasten, minimale opbouw ──────────────────
  {
    // NonlinearSolver.ts:789, :1158, :1441
    patroon: /^Model has no constraints - add boundary conditions$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft geen opleggingen \u2014 voeg randvoorwaarden toe. Zonder opleggingen kan de constructie vrij zweven en is er geen oplossing."
  },
  {
    // NonlinearSolver.ts:796, :1198
    patroon: /^No loads applied - add forces to nodes(?: or elements)?$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Geen werkzame belasting in dit belastinggeval \u2014 voeg lasten toe op knopen, staven of platen."
  },
  {
    // NonlinearSolver.ts:774
    patroon: /^Model must have at least 2 nodes$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft minstens twee knopen nodig."
  },
  {
    // NonlinearSolver.ts:777
    patroon: /^Model must have at least 1 beam element$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft minstens \xE9\xE9n staaf nodig."
  },
  {
    // NonlinearSolver.ts:1074
    patroon: /^Model must have at least 1 plate element$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Model heeft minstens \xE9\xE9n plaatelement nodig."
  },
  {
    // NonlinearSolver.ts:768
    patroon: /^Model must have plate elements for this analysis type, or beams for frame analysis$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Dit analysetype vraagt plaatelementen, of staven voor een raamwerkberekening \u2014 het model bevat geen van beide."
  },
  {
    // NonlinearSolver.ts:1422
    patroon: /^Mixed analysis requires at least one plate or beam element$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Een gemengde berekening (staven \xE9n platen) vraagt minstens \xE9\xE9n staaf of plaat."
  },
  // ── 2. Mechanisme, singulariteit en opleggingen op het plaatmesh ────────
  {
    // NonlinearSolver.ts:1179, :1455
    patroon: /^Insufficient constraints: (\d+) DOFs constrained, need at least 3 to prevent rigid body motion$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => `Te weinig opleggingen: ${m[1]} vrijheidsgraad/-graden vastgezet, er zijn er minstens drie nodig om starre-lichaamsbeweging te voorkomen. De constructie is een mechanisme.`
  },
  {
    // NonlinearSolver.ts:1169
    patroon: /^Constraints are not on mesh nodes and couldn't be transferred\. Problem nodes: (.*)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => `Opleggingen liggen niet op rekenknopen van het plaatmesh en konden niet worden overgezet. Probleemknopen: ${m[1]}. Verplaats de steunpunten naar hoek- of randknopen van de plaat, of pas de meshSize aan.`
  },
  {
    // NonlinearSolver.ts:1445
    patroon: /^Constraints are not on mesh nodes - place supports on plate corner\/edge nodes or beam nodes$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Opleggingen liggen niet op rekenknopen \u2014 zet steunpunten op hoek- of randknopen van een plaat, of op knopen van een staaf."
  },
  {
    // NonlinearSolver.ts:1196
    patroon: /^Loads on (\d+) node\(s\) not connected to elements \(inactive\)\. Loads: (.*?)\. Total elements: (\d+)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => `Lasten op ${m[1]} knoop/knopen die niet met een element verbonden zijn en dus niet meetellen: ${m[2]}. Het model telt ${m[3]} element(en). Verbind die knopen met een staaf of plaat, of verplaats de lasten.`
  },
  {
    // NonlinearSolver.ts:1246
    patroon: /^Singular matrix at DOF (\d+): node (\S+) at \(([^)]*)\), direction=([^.]*)\. Check boundary conditions and element connectivity\.$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => `Het stelsel is singulier bij vrijheidsgraad ${m[1]}: knoop ${m[2]} op (${m[3]}), richting ${m[4]}. Die knoop kan vrij bewegen \u2014 controleer de opleggingen en of alle elementen daadwerkelijk aan elkaar vastzitten.`
  },
  {
    // GaussElimination.ts:37
    patroon: /^Matrix is singular or nearly singular at column (\d+)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => `Het stelsel is (bijna) singulier bij kolom ${m[1]}. Dat wijst op een mechanisme: een ontbrekende oplegging, een los constructiedeel of een staaf met stijfheid nul.`
  },
  // ── 3. Ontaarde elementgeometrie ───────────────────────────────────────
  {
    // Beam.ts:134, Assembler.ts:103 en :213
    patroon: /^Beam element has zero length$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Een staaf heeft lengte nul \u2014 begin- en eindknoop vallen samen. Verwijder de staaf of verplaats een van beide knopen."
  },
  {
    // Triangle.ts:43 en DKT.ts:237
    patroon: /^(?:DKT triangle|Triangle) has zero or negative area$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Een driehoekselement van het plaatmesh heeft geen oppervlakte. Het mesh is ontaard: wijzig de plaatgeometrie of de meshSize zodat het opnieuw wordt gegenereerd."
  },
  {
    // Quad4.ts:132
    patroon: /^Quad element has non-positive Jacobian determinant \(bad element shape\)$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "Een vierhoekselement van het plaatmesh heeft een ontaarde vorm (niet-positieve Jacobiaan). Pas de plaatgeometrie of de meshSize aan."
  },
  // ── 4. Tweede orde (P-Δ) ───────────────────────────────────────────────
  {
    // NonlinearSolver.ts:992
    patroon: /^Second-order \(P-Delta\) analysis did not converge within (\d+) iterations — the load is at, above, or very close to the critical \(buckling\) load$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => `De tweede-orde-berekening (P-\u0394) convergeerde niet binnen ${m[1]} iteraties \u2014 de belasting ligt op, boven of vlak onder de kritieke (knik)waarde. Verlaag de belasting of verzwaar de constructie.`
  },
  {
    // NonlinearSolver.ts:905 (DIVERGENCE_MSG)
    patroon: /^Second-order \(P-Delta\) analysis did not converge — the applied load is at or above the critical \(buckling\) load$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "De tweede-orde-berekening (P-\u0394) divergeert \u2014 de belasting ligt op of boven de kritieke (knik)waarde. Verlaag de belasting of verzwaar de constructie."
  },
  {
    // NonlinearSolver.ts:1024
    patroon: /^Second-order \(P-Delta\) analysis is unstable — the applied load is at or above the critical \(buckling\) load$/,
    code: "MODEL_ONOPLOSBAAR",
    nl: () => "De tweede-orde-berekening (P-\u0394) is instabiel \u2014 de belasting ligt op of boven de kritieke (knik)waarde. De gevonden oplossing zou fysisch betekenisloos zijn; verlaag de belasting of verzwaar de constructie."
  },
  // ── 5. Wiskundige dimensiefouten: dit zijn PROGRAMMAFOUTEN ─────────────
  // Ze zeggen niets over de constructie van de gebruiker, dus krijgen ze code
  // INTERN. Een gebruiker kan hier niets aan doen; dit hoort als bug gemeld.
  {
    // GaussElimination.ts:7, Matrix.ts:40/53/66/83, Vector.ts:30/41/60
    patroon: /^(?:Matrix must be square|Vector length must match matrix size|Matrix dimensions must match for \w+|Cannot multiply \d+x\d+ by \d+x\d+|Matrix columns must match vector length|Vector dimensions must match for [\w ]+)$/,
    code: "INTERN",
    nl: () => "Interne rekenfout: de afmetingen van matrix en vector komen niet overeen. Dit is een programmafout in de solver, geen modelfout \u2014 meld hem met de originele melding uit `detail`."
  },
  // ── 6. Meldingen die de adapterlaag al in het Nederlands geeft ──────────
  // Tekst ONGEWIJZIGD doorgeven: hij is al gericht aan de constructeur en
  // bevat de remedie. Zonder deze regels zou hij als onbekend gelden.
  {
    // engine.ts:245/249/274/285/299
    patroon: /^Plaat \d+[:\s]/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // engine.ts:582
    patroon: /^Model te groot voor de ingebouwde solver:/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // engine.ts:593
    patroon: /^Steunpunt op knoop \d+ ligt niet op een rekenknoop/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // engine.ts:604
    patroon: /^Puntlast op knoop \d+ ligt niet op een rekenknoop/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // engine.ts:1268 en :1289
    patroon: /^2e-orde-berekening/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // engine.ts (buildMesh): een staaf van lengte nul wordt geweigerd in
    // plaats van stil overgeslagen.
    patroon: /^Staaf \d+ heeft lengte nul:/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // NonlinearSolver.ts (nulElementFout): hetzelfde, voor een rekenelement.
    patroon: /^Rekenelement \d+ heeft lengte nul:/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // NonlinearSolver.ts (SingulierStelselFout) via engine.ts: het singuliere
    // stelsel met knoop en richting in plaats van een kolomnummer. Het is
    // géén "mechanisme"-melding meer: een vrij draaiende knoop is een
    // modelfout met een aanwijsbare plek.
    patroon: /^Het stelsel is singulier: /,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  },
  {
    // engine.ts (eisEindigeUitkomst): NaN of oneindig in het resultaat.
    patroon: /^De berekening leverde een ongeldig getal/,
    code: "MODEL_ONOPLOSBAAR",
    nl: (m) => m.input
  }
];
function beeldKernfoutAf(origineel) {
  const tekst = origineel.trim();
  for (const regel of AFBEELDINGEN) {
    const treffer = regel.patroon.exec(tekst);
    if (treffer) {
      return {
        code: regel.code,
        melding: regel.nl(treffer),
        detail: { originele_melding: origineel },
        herkend: true
      };
    }
  }
  return {
    code: "INTERN",
    melding: "De rekenkern gaf een melding die de sidecar niet kent. De originele tekst staat in `detail.originele_melding`; behandel dit resultaat niet als een uitspraak over de constructie.",
    detail: { originele_melding: origineel },
    herkend: false
  };
}
function aantalAfbeeldingen() {
  return AFBEELDINGEN.length;
}

// src/lib/materiaalDubbelzinnig.ts
function dubbelzinnigMateriaal(material) {
  if (!material) return null;
  const naam = material.trim();
  const hout = SUPPORTED_TIMBER_GRADES.find(
    (g) => g.toLowerCase() === naam.toLowerCase()
  );
  if (!hout) return null;
  const beton = SUPPORTED_CONCRETE_CLASSES.find(
    (c) => c.split("/")[0].toLowerCase() === naam.toLowerCase()
  );
  return beton ? { hout, beton } : null;
}
function dubbelzinnigMateriaalTekst(beamId, d, metKorf) {
  const basis = `Staaf ${beamId}: materiaal "${d.hout}" is dubbelzinnig \u2014 het is houtsterkteklasse ${d.hout} (EN 338) \xE9n de korte naam van betonklasse ${d.beton} (NEN-EN 1992-1-1 tabel 3.1). Er wordt met HOUT gerekend (stijfheid en eigen gewicht van hout, houttoets); de betontoets slaat deze staaf over. Bedoelt u beton, schrijf dan "${d.beton}".`;
  return metKorf ? basis + ` Deze staaf heeft bovendien een wapeningskorf, en die hoort bij beton: dat botst. Schrijf "${d.beton}" voor beton, of haal de korf weg voor hout.` : basis;
}

// src/lib/modelControle.ts
var CONTROLE_TOL_MM = 1;
function zoekDubbeleKnopen(model, tolMm = CONTROLE_TOL_MM) {
  const verbonden = /* @__PURE__ */ new Set();
  for (const b of model.beams) {
    verbonden.add(b.from < b.to ? `${b.from}-${b.to}` : `${b.to}-${b.from}`);
  }
  const uit = [];
  const { nodes } = model;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (Math.abs(a.x - b.x) > tolMm || Math.abs(a.z - b.z) > tolMm) continue;
      const sleutel = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      const zitVast = verbonden.has(sleutel);
      uit.push({
        soort: "dubbeleKnoop",
        ernst: "fout",
        nodeIds: [a.id, b.id],
        tekst: zitVast ? `Knoop ${a.id} en knoop ${b.id} liggen op dezelfde plek (${a.x}, ${a.z}) mm en zijn met een staaf van lengte nul verbonden; voeg ze samen.` : `Knoop ${a.id} en knoop ${b.id} liggen op dezelfde plek (${a.x}, ${a.z}) mm. Ze zijn NIET met elkaar verbonden; voeg ze samen of verplaats er \xE9\xE9n.`,
        // De laagste id blijft bestaan: stabiel en voorspelbaar, ongeacht in
        // welke volgorde de knopen zijn getekend.
        herstel: {
          soort: "voegSamen",
          bewaarId: Math.min(a.id, b.id),
          verwijderId: Math.max(a.id, b.id)
        }
      });
    }
  }
  return uit;
}

// src/mcp/valideerModel.ts
var MODEL_VELDEN = [
  "nodes",
  "beams",
  "supports",
  "plates",
  "loadCases",
  "loads",
  "selfWeightEnabled",
  "scheefstandEnabled",
  "scheefstandNoemer",
  "scheefstandRichting",
  // De normkeuze van de scheefstand (basisaudit nr 19): de sidecar rekent φ
  // hiermee zoals de app; het MCP-schema kent dezelfde drie velden.
  "scheefstandBron",
  "scheefstandHoogteM",
  "scheefstandAantalElementen"
];
var NODE_VELDEN = ["id", "x", "z"];
var BEAM_VELDEN = [
  "id",
  "from",
  "to",
  "material",
  "profile",
  "releases",
  "checkConfig",
  "loadRole",
  // Eindprofiel van een verlopende staaf (ontwerp 15 september 2026, §4.1);
  // `profile` is dan het beginprofiel. Zelfde spiegel in `schema_beams`
  // (openaec-mcp-server/src/fem_tools.rs), bewaakt door een Rust-test.
  "profileEnd"
];
var RELEASE_VELDEN = [
  "startTx",
  "startTz",
  "startRy",
  "endTx",
  "endTz",
  "endRy"
];
var CHECKCONFIG_VELDEN = [
  "bucklingLengthY_m",
  "bucklingLengthZ_m",
  "lateralRestraints",
  "lateralRestraintsBottom",
  "deflectionClass",
  "deflectionLimitNumerator",
  "deflectionAddLimitNumerator",
  "preCamber_mm",
  "serviceClass",
  "loadDuration",
  "betonKorf",
  "betonMilieuklasse",
  "betonConstructieklasse",
  "betonStaalsoort",
  "betonStroken",
  "betonStaaltak",
  "betonKolom",
  "spanningSigmaZ",
  // De kipsteunafstand van hout (EN 1995-1-1 art. 6.3.3). De UI schrijft hem
  // weg en `timberCheckBuilder` leest hem, maar hij stond hier niet: elk
  // houtmodel met een kipsteunafstand werd langs de MCP-weg geweigerd.
  "ltbSupportSpacing_m",
  // De drie houtkeuzen van september 2026: scheurfactor k_cr (6.1.7),
  // kiptoets aan/uit (6.3.3(5)) en het aangrijpingspunt van de belasting
  // (tabel 6.1). Tot dan zaten ze vast in de houtbouwer.
  "kCr",
  "performLtbCheck",
  "ltbLoadPosition"
];
var LTB_LASTPOSITIES = ["centreOfGravity", "compressionEdge", "tensionEdge"];
var KOLOM_VELDEN = [
  "bracing",
  "buckling_length",
  "phi_inf_t0",
  "stirrup_zone",
  "lap_situation",
  "bracing_z",
  "buckling_length_z",
  "m0_edz_knm"
];
var SCHORINGEN = ["Geschoord", "Ongeschoord"];
var KNIKGEVALLEN_GELDIG = [
  "ScharnierendScharnierend",
  "Console",
  "IngeklemdScharnierend",
  "TweezijdigIngeklemdGeschoord",
  "TweezijdigIngeklemdOngeschoord"
];
var BEUGELZONES = ["Regulier", "BijBalkOfPlaat", "BijOverlappingslas"];
var OVERLAPPINGSSITUATIES = [
  "GeenLassen",
  "LassenBuitenDezeDoorsnede",
  "TerPlaatseVanLas"
];
var KORF_VELDEN_VERPLICHT = ["cover_mm", "stirrup_diameter_mm", "top", "bottom"];
var KORF_VELDEN_BEUGEL = [
  "stirrup_spacing_mm",
  "stirrup_legs",
  "stirrup_leg_spacing_mm",
  "stirrup_fywk_mpa"
];
var KORF_VELDEN = [...KORF_VELDEN_VERPLICHT, ...KORF_VELDEN_BEUGEL];
var REBARROW_VELDEN = ["count", "diameter_mm"];
var MILIEUKLASSEN = [
  "X0",
  "XC1",
  "XC2",
  "XC3",
  "XC4",
  "XD1",
  "XD2",
  "XD3",
  "XS1",
  "XS2",
  "XS3",
  "XF1",
  "XF2",
  "XF3",
  "XF4",
  "XA1",
  "XA2",
  "XA3"
];
var CONSTRUCTIEKLASSEN = ["S1", "S2", "S3", "S4", "S5", "S6"];
var STAALTAKKEN = ["Horizontal", "Inclined"];
var SUPPORT_VELDEN = ["nodeId", "type", "k"];
var PLATE_VELDEN = [
  "id",
  "nodeIds",
  "thickness",
  "E",
  "nu",
  "rho",
  "meshSize",
  "meshCache"
];
var MESHCACHE_VELDEN = [
  "signature",
  "points",
  "triangles",
  "edgeNodeIndices"
];
var LOAD_VELDEN = [
  "id",
  "type",
  "caseId",
  "nodeId",
  "fx",
  "fz",
  "my",
  "beamId",
  "posFrac",
  "q",
  "qStart",
  "qEnd",
  "qDir",
  "qCoord",
  "startFrac",
  "endFrac",
  "deltaT",
  "plateId",
  "edge",
  "edgeIndex",
  "gegenereerdDoor",
  "omschrijving"
];
var LOADCASE_VELDEN = ["id", "name", "type", "categorie", "gegenereerd"];
var SUPPORT_TYPES = [
  "pinned",
  "fixed",
  "xRoller",
  "zRoller",
  "zSpring",
  "xSpring",
  "rotSpring"
];
var LOAD_TYPES = [
  "pointForce",
  "pointMoment",
  "lineLoad",
  "thermal",
  "edgeLoad"
];
var LOADCASE_TYPES = ["dead", "live", "snow", "wind", "other"];
var LOADROLLEN = [
  "gevelLinks",
  "gevelRechts",
  "dakPlat",
  "dakHellend",
  "overstek",
  "vloer",
  "binnen"
];
var VASTGEZET = {
  fixed: ["x", "z", "ry"],
  pinned: ["x", "z"],
  xRoller: ["x"],
  zRoller: ["z"],
  xSpring: ["x"],
  zSpring: ["z"],
  rotSpring: ["ry"]
};
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isGetal = (v) => typeof v === "number" && Number.isFinite(v);
var isGeheel = (v) => isGetal(v) && Number.isInteger(v);
function afstand(a, b) {
  const rij = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let vorige = rij[0];
    rij[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tijdelijk = rij[j];
      rij[j] = Math.min(
        rij[j] + 1,
        rij[j - 1] + 1,
        vorige + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      vorige = tijdelijk;
    }
  }
  return rij[b.length];
}
function dichtstbij(veld, bekend) {
  let beste = null;
  let besteAfstand = Number.POSITIVE_INFINITY;
  for (const kandidaat of bekend) {
    const d = afstand(veld.toLowerCase(), kandidaat.toLowerCase());
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = kandidaat;
    }
  }
  const drempel = Math.max(1, Math.floor(veld.length / 3));
  return beste !== null && besteAfstand <= drempel ? beste : null;
}
function keurVelden(obj, toegestaan, pad, fouten) {
  for (const veld of Object.keys(obj)) {
    if (toegestaan.includes(veld)) continue;
    const hint = dichtstbij(veld, toegestaan);
    fouten.push(
      `${pad}: onbekend veld \`${veld}\`. ` + (hint !== null ? `Bedoelde u \`${hint}\`? Een onbekend veld wordt niet meegerekend.` : `Bekende velden: ${toegestaan.join(", ")}.`)
    );
  }
}
function keurEnum(waarde, toegestaan, pad, fouten) {
  if (waarde === void 0) return;
  if (typeof waarde !== "string" || !toegestaan.includes(waarde)) {
    fouten.push(
      `${pad}: ${JSON.stringify(waarde)} is geen geldige waarde. Toegestaan: ${toegestaan.join(", ")}.`
    );
  }
}
function keurGetal(waarde, pad, fouten, { positief = false } = {}) {
  if (waarde === void 0) return;
  if (!isGetal(waarde)) {
    fouten.push(`${pad}: moet een getal zijn, maar is ${JSON.stringify(waarde)}.`);
    return;
  }
  if (positief && waarde <= 0) {
    fouten.push(`${pad}: moet groter dan nul zijn, maar is ${waarde}.`);
  }
}
function keurKorf(waarde, pad, fouten) {
  if (waarde === void 0) return;
  if (!isObject(waarde)) {
    fouten.push(`${pad}: moet een object zijn (dekking, beugel, boven- en onderwapening).`);
    return;
  }
  keurVelden(waarde, KORF_VELDEN, pad, fouten);
  for (const veld of KORF_VELDEN_VERPLICHT) {
    if (waarde[veld] === void 0) {
      fouten.push(`${pad}.${veld} ontbreekt; een wapeningskorf heeft alle vier de onderdelen nodig.`);
    }
  }
  for (const veld of KORF_VELDEN_BEUGEL) {
    const v = waarde[veld];
    if (v === void 0 || v === null) continue;
    if (!isGetal(v) || v <= 0) {
      fouten.push(
        `${pad}.${veld}: moet een getal > 0 zijn, maar is ${JSON.stringify(v)}. Laat het veld WEG als het niet is opgegeven \u2014 leeg en nul betekenen hier niet hetzelfde.`
      );
    }
  }
  for (const veld of [`cover_mm`, `stirrup_diameter_mm`]) {
    const v = waarde[veld];
    if (v === void 0) continue;
    if (!isGetal(v) || v < 0) {
      fouten.push(`${pad}.${veld}: moet een getal \u2265 0 zijn, maar is ${JSON.stringify(v)}.`);
    }
  }
  for (const kant of ["top", "bottom"]) {
    const rij = waarde[kant];
    if (rij === void 0) continue;
    if (!isObject(rij)) {
      fouten.push(`${pad}.${kant}: moet een object met \`count\` en \`diameter_mm\` zijn.`);
      continue;
    }
    keurVelden(rij, REBARROW_VELDEN, `${pad}.${kant}`, fouten);
    for (const veld of REBARROW_VELDEN) {
      const v = rij[veld];
      if (v === void 0) {
        fouten.push(`${pad}.${kant}.${veld} ontbreekt.`);
      } else if (!isGetal(v) || v < 0) {
        fouten.push(`${pad}.${kant}.${veld}: moet een getal \u2265 0 zijn, maar is ${JSON.stringify(v)}.`);
      }
    }
  }
}
function keurKolom(waarde, pad, fouten) {
  if (waarde === void 0) return;
  if (!isObject(waarde)) {
    fouten.push(`${pad}: moet een object zijn (schoring, kniklengte en de \xA79.5-keuzen).`);
    return;
  }
  keurVelden(waarde, KOLOM_VELDEN, pad, fouten);
  if (waarde.bracing === void 0) {
    fouten.push(
      `${pad}.bracing ontbreekt. Geschoord of ongeschoord is het ontwerpbesluit van art. 5.8.1 en heeft met opzet geen standaardwaarde; zonder die keuze is er geen kniklengte en geen slankheidsgrens.`
    );
  }
  keurEnum(waarde.bracing, SCHORINGEN, `${pad}.bracing`, fouten);
  keurGetal(waarde.phi_inf_t0, `${pad}.phi_inf_t0`, fouten, { positief: true });
  keurEnum(waarde.stirrup_zone, BEUGELZONES, `${pad}.stirrup_zone`, fouten);
  keurEnum(waarde.lap_situation, OVERLAPPINGSSITUATIES, `${pad}.lap_situation`, fouten);
  keurEnum(waarde.bracing_z, SCHORINGEN, `${pad}.bracing_z`, fouten);
  keurGetal(waarde.m0_edz_knm, `${pad}.m0_edz_knm`, fouten);
  if (waarde.buckling_length_z !== void 0) {
    keurKniklengte(waarde.buckling_length_z, `${pad}.buckling_length_z`, fouten);
  }
  if (waarde.buckling_length === void 0) {
    fouten.push(`${pad}.buckling_length ontbreekt; zonder l\u2080 is er geen slankheid \u03BB = l\u2080/i.`);
    return;
  }
  keurKniklengte(waarde.buckling_length, `${pad}.buckling_length`, fouten);
}
function keurKniklengte(kl, pad, fouten) {
  if (!isObject(kl)) {
    fouten.push(`${pad}: moet een object met \`soort\` zijn.`);
    return;
  }
  if (kl.soort === "Figuur57") {
    keurVelden(kl, ["soort", "geval"], pad, fouten);
    keurEnum(kl.geval, KNIKGEVALLEN_GELDIG, `${pad}.geval`, fouten);
    if (kl.geval === void 0) {
      fouten.push(`${pad}.geval ontbreekt.`);
    }
  } else if (kl.soort === "Opgegeven") {
    keurVelden(kl, ["soort", "l0_m"], pad, fouten);
    if (kl.l0_m === void 0) {
      fouten.push(`${pad}.l0_m ontbreekt; l\u2080 is hier het hele gegeven.`);
    }
    keurGetal(kl.l0_m, `${pad}.l0_m`, fouten, { positief: true });
  } else {
    fouten.push(
      `${pad}.soort: ${JSON.stringify(kl.soort)} bestaat niet. Toegestaan: Figuur57 (een vakje van figuur 5.7) of Opgegeven (l\u2080 rechtstreeks).`
    );
  }
}
function eisGeheel(waarde, pad, fouten) {
  if (!isGeheel(waarde)) {
    fouten.push(
      `${pad}: verplicht en moet een geheel getal zijn, maar is ${JSON.stringify(waarde)}.`
    );
  }
}
function leesArray(model, veld, fouten) {
  const waarde = model[veld];
  if (waarde === void 0) return [];
  if (!Array.isArray(waarde)) {
    fouten.push(`model.${veld}: moet een array zijn.`);
    return [];
  }
  return waarde;
}
function keurCheckConfig(waarde, cpad) {
  const fouten = [];
  if (!isObject(waarde)) {
    fouten.push(`${cpad}: moet een object zijn.`);
    return fouten;
  }
  const cc = waarde;
  keurVelden(cc, CHECKCONFIG_VELDEN, cpad, fouten);
  keurGetal(cc.bucklingLengthY_m, `${cpad}.bucklingLengthY_m`, fouten, { positief: true });
  keurGetal(cc.bucklingLengthZ_m, `${cpad}.bucklingLengthZ_m`, fouten, { positief: true });
  keurGetal(cc.deflectionLimitNumerator, `${cpad}.deflectionLimitNumerator`, fouten, { positief: true });
  keurGetal(cc.deflectionAddLimitNumerator, `${cpad}.deflectionAddLimitNumerator`, fouten, { positief: true });
  keurGetal(cc.preCamber_mm, `${cpad}.preCamber_mm`, fouten);
  keurGetal(cc.ltbSupportSpacing_m, `${cpad}.ltbSupportSpacing_m`, fouten, { positief: true });
  keurGetal(cc.kCr, `${cpad}.kCr`, fouten, { positief: true });
  if (isGetal(cc.kCr) && cc.kCr > 1) {
    fouten.push(`${cpad}.kCr: moet ten hoogste 1 zijn (b_ef = k_cr \xB7 b), maar is ${cc.kCr}.`);
  }
  if (cc.performLtbCheck !== void 0 && typeof cc.performLtbCheck !== "boolean") {
    fouten.push(`${cpad}.performLtbCheck: moet true of false zijn, maar is ${JSON.stringify(cc.performLtbCheck)}.`);
  }
  keurEnum(cc.ltbLoadPosition, LTB_LASTPOSITIES, `${cpad}.ltbLoadPosition`, fouten);
  keurEnum(cc.deflectionClass, ["floor", "floorBrittle", "roof", "cantilever", "custom"], `${cpad}.deflectionClass`, fouten);
  keurEnum(cc.loadDuration, ["permanent", "long", "medium", "short", "instantaneous"], `${cpad}.loadDuration`, fouten);
  if (cc.serviceClass !== void 0 && ![1, 2, 3].includes(cc.serviceClass)) {
    fouten.push(`${cpad}.serviceClass: moet 1, 2 of 3 zijn.`);
  }
  for (const veld of ["lateralRestraints", "lateralRestraintsBottom"]) {
    const lijst = cc[veld];
    if (lijst === void 0) continue;
    if (!Array.isArray(lijst) || !lijst.every(isGetal)) {
      fouten.push(`${cpad}.${veld}: moet een array van getallen (fracties 0..1) zijn.`);
    }
  }
  keurEnum(cc.betonMilieuklasse, MILIEUKLASSEN, `${cpad}.betonMilieuklasse`, fouten);
  keurEnum(cc.betonConstructieklasse, CONSTRUCTIEKLASSEN, `${cpad}.betonConstructieklasse`, fouten);
  keurEnum(cc.betonStaalsoort, SUPPORTED_REINFORCEMENT_GRADES, `${cpad}.betonStaalsoort`, fouten);
  keurEnum(cc.betonStaaltak, STAALTAKKEN, `${cpad}.betonStaaltak`, fouten);
  keurGetal(cc.betonStroken, `${cpad}.betonStroken`, fouten, { positief: true });
  keurGetal(cc.spanningSigmaZ, `${cpad}.spanningSigmaZ`, fouten);
  keurKorf(cc.betonKorf, `${cpad}.betonKorf`, fouten);
  keurKolom(cc.betonKolom, `${cpad}.betonKolom`, fouten);
  return fouten;
}
function controleerVelden(rauw) {
  const fouten = [];
  if (!isObject(rauw)) {
    return ["model: moet een JSON-object zijn."];
  }
  keurVelden(rauw, MODEL_VELDEN, "model", fouten);
  for (const vlag of ["selfWeightEnabled", "scheefstandEnabled"]) {
    if (rauw[vlag] !== void 0 && typeof rauw[vlag] !== "boolean") {
      fouten.push(`model.${vlag}: moet true of false zijn.`);
    }
  }
  keurGetal(rauw.scheefstandNoemer, "model.scheefstandNoemer", fouten, {
    positief: true
  });
  if (rauw.scheefstandRichting !== void 0 && rauw.scheefstandRichting !== 1 && rauw.scheefstandRichting !== -1) {
    fouten.push("model.scheefstandRichting: moet 1 (+x) of \u22121 (\u2212x) zijn.");
  }
  if (rauw.scheefstandBron !== void 0 && rauw.scheefstandBron !== null && !SCHEEFSTAND_BRONNEN.includes(rauw.scheefstandBron)) {
    fouten.push(
      `model.scheefstandBron: "${String(rauw.scheefstandBron)}" is onbekend; bekend zijn ` + SCHEEFSTAND_BRONNEN.map((b) => `"${b}"`).join(", ") + "."
    );
  }
  const hoogte = rauw.scheefstandHoogteM;
  if (hoogte !== void 0 && hoogte !== null && !(typeof hoogte === "number" && Number.isFinite(hoogte) && hoogte > 0)) {
    fouten.push("model.scheefstandHoogteM: moet een getal groter dan 0 zijn (m), of null.");
  }
  const aantal = rauw.scheefstandAantalElementen;
  if (aantal !== void 0 && aantal !== null && !(typeof aantal === "number" && Number.isInteger(aantal) && aantal >= 1)) {
    fouten.push("model.scheefstandAantalElementen: moet een geheel getal van minstens 1 zijn, of null.");
  }
  const nodes = leesArray(rauw, "nodes", fouten);
  nodes.forEach((n, i) => {
    const pad = `model.nodes[${i}]`;
    if (!isObject(n)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(n, NODE_VELDEN, pad, fouten);
    eisGeheel(n.id, `${pad}.id`, fouten);
    if (!isGetal(n.x)) fouten.push(`${pad}.x: verplicht getal (mm).`);
    if (!isGetal(n.z)) fouten.push(`${pad}.z: verplicht getal (mm).`);
  });
  const beams = leesArray(rauw, "beams", fouten);
  beams.forEach((b, i) => {
    const pad = `model.beams[${i}]`;
    if (!isObject(b)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(b, BEAM_VELDEN, pad, fouten);
    eisGeheel(b.id, `${pad}.id`, fouten);
    eisGeheel(b.from, `${pad}.from`, fouten);
    eisGeheel(b.to, `${pad}.to`, fouten);
    for (const veld of ["material", "profile", "profileEnd"]) {
      if (b[veld] !== void 0 && typeof b[veld] !== "string") {
        fouten.push(`${pad}.${veld}: moet tekst zijn.`);
      }
    }
    keurEnum(b.loadRole, LOADROLLEN, `${pad}.loadRole`, fouten);
    if (b.releases !== void 0) {
      if (!isObject(b.releases)) {
        fouten.push(`${pad}.releases: moet een object zijn.`);
      } else {
        keurVelden(b.releases, RELEASE_VELDEN, `${pad}.releases`, fouten);
        for (const [veld, waarde] of Object.entries(b.releases)) {
          if (waarde !== void 0 && typeof waarde !== "boolean") {
            fouten.push(`${pad}.releases.${veld}: moet true of false zijn.`);
          }
        }
      }
    }
    if (b.checkConfig !== void 0) {
      fouten.push(...keurCheckConfig(b.checkConfig, `${pad}.checkConfig`));
    }
  });
  const supports = leesArray(rauw, "supports", fouten);
  supports.forEach((s, i) => {
    const pad = `model.supports[${i}]`;
    if (!isObject(s)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(s, SUPPORT_VELDEN, pad, fouten);
    eisGeheel(s.nodeId, `${pad}.nodeId`, fouten);
    if (s.type === void 0) {
      fouten.push(`${pad}.type: verplicht. Toegestaan: ${SUPPORT_TYPES.join(", ")}.`);
    } else {
      keurEnum(s.type, SUPPORT_TYPES, `${pad}.type`, fouten);
    }
    keurGetal(s.k, `${pad}.k`, fouten);
  });
  const plates = leesArray(rauw, "plates", fouten);
  plates.forEach((p, i) => {
    const pad = `model.plates[${i}]`;
    if (!isObject(p)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(p, PLATE_VELDEN, pad, fouten);
    eisGeheel(p.id, `${pad}.id`, fouten);
    if (!Array.isArray(p.nodeIds) || !p.nodeIds.every(isGeheel)) {
      fouten.push(`${pad}.nodeIds: verplichte array van knoop-id's.`);
    } else if (p.nodeIds.length < 3) {
      fouten.push(`${pad}.nodeIds: een plaat heeft minstens drie hoekknopen nodig.`);
    }
    keurGetal(p.thickness, `${pad}.thickness`, fouten, { positief: true });
    keurGetal(p.E, `${pad}.E`, fouten, { positief: true });
    keurGetal(p.nu, `${pad}.nu`, fouten);
    keurGetal(p.rho, `${pad}.rho`, fouten, { positief: true });
    keurGetal(p.meshSize, `${pad}.meshSize`, fouten, { positief: true });
    if (p.meshCache !== void 0) {
      if (!isObject(p.meshCache)) {
        fouten.push(`${pad}.meshCache: moet een object zijn.`);
      } else {
        keurVelden(p.meshCache, MESHCACHE_VELDEN, `${pad}.meshCache`, fouten);
        if (typeof p.meshCache.signature !== "string") {
          fouten.push(`${pad}.meshCache.signature: verplichte tekst (geometrie-handtekening).`);
        }
        if (!Array.isArray(p.meshCache.points) || !Array.isArray(p.meshCache.triangles)) {
          fouten.push(`${pad}.meshCache: \`points\` en \`triangles\` zijn verplichte arrays.`);
        }
        const randen = p.meshCache.edgeNodeIndices;
        if (!Array.isArray(randen)) {
          fouten.push(
            `${pad}.meshCache.edgeNodeIndices: verplichte array met per plaatrand (rand i loopt van hoek i naar hoek i+1) de indices van de meshknopen op die rand. Zonder die lijsten vindt geen randlast, randpuntlast of staafaansluiting zijn rand.`
          );
        } else {
          if (Array.isArray(p.nodeIds) && randen.length !== p.nodeIds.length) {
            fouten.push(
              `${pad}.meshCache.edgeNodeIndices: beschrijft ${randen.length} ${randen.length === 1 ? "rand" : "randen"}, maar de plaat heeft ${p.nodeIds.length} hoeken en dus ${p.nodeIds.length} randen.`
            );
          }
          randen.forEach((rand, r) => {
            if (!Array.isArray(rand) || rand.length < 2 || !rand.every((k) => isGeheel(k) && k >= 0)) {
              fouten.push(
                `${pad}.meshCache.edgeNodeIndices[${r}]: moet een lijst van minstens twee puntindices (gehele getallen \u2265 0) zijn \u2014 de twee hoeken en de knopen ertussen.`
              );
            }
          });
        }
      }
    }
  });
  const loadCases = leesArray(rauw, "loadCases", fouten);
  loadCases.forEach((lc, i) => {
    const pad = `model.loadCases[${i}]`;
    if (!isObject(lc)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(lc, LOADCASE_VELDEN, pad, fouten);
    eisGeheel(lc.id, `${pad}.id`, fouten);
    if (typeof lc.name !== "string" || lc.name.length === 0) {
      fouten.push(`${pad}.name: verplichte naam.`);
    }
    keurEnum(lc.type, LOADCASE_TYPES, `${pad}.type`, fouten);
    keurEnum(lc.categorie, GEBRUIKSCATEGORIEEN, `${pad}.categorie`, fouten);
  });
  const loads = leesArray(rauw, "loads", fouten);
  loads.forEach((l, i) => {
    const pad = `model.loads[${i}]`;
    if (!isObject(l)) return void fouten.push(`${pad}: moet een object zijn.`);
    keurVelden(l, LOAD_VELDEN, pad, fouten);
    eisGeheel(l.id, `${pad}.id`, fouten);
    eisGeheel(l.caseId, `${pad}.caseId`, fouten);
    if (l.type === void 0) {
      fouten.push(`${pad}.type: verplicht. Toegestaan: ${LOAD_TYPES.join(", ")}.`);
    } else {
      keurEnum(l.type, LOAD_TYPES, `${pad}.type`, fouten);
    }
    for (const veld of ["nodeId", "beamId", "plateId", "edgeIndex"]) {
      if (l[veld] !== void 0 && !isGeheel(l[veld])) {
        fouten.push(`${pad}.${veld}: moet een geheel getal zijn.`);
      }
    }
    for (const veld of ["fx", "fz", "my", "q", "qStart", "qEnd", "deltaT"]) {
      keurGetal(l[veld], `${pad}.${veld}`, fouten);
    }
    for (const veld of ["posFrac", "startFrac", "endFrac"]) {
      const waarde = l[veld];
      if (waarde === void 0) continue;
      if (!isGetal(waarde) || waarde < 0 || waarde > 1) {
        fouten.push(`${pad}.${veld}: moet een fractie tussen 0 en 1 zijn.`);
      }
    }
    keurEnum(l.qDir, ["x", "z"], `${pad}.qDir`, fouten);
    keurEnum(l.qCoord, ["global", "local"], `${pad}.qCoord`, fouten);
    keurEnum(l.edge, ["bottom", "top", "left", "right"], `${pad}.edge`, fouten);
    keurEnum(l.gegenereerdDoor, ["wind"], `${pad}.gegenereerdDoor`, fouten);
    if (l.omschrijving !== void 0 && typeof l.omschrijving !== "string") {
      fouten.push(
        `${pad}.omschrijving: moet tekst zijn, maar is ${JSON.stringify(l.omschrijving)}.`
      );
    }
  });
  return fouten;
}
function meldDubbeleIds(items, soort, fouten) {
  const gezien = /* @__PURE__ */ new Set();
  for (const item of items) {
    const id = item.id;
    if (typeof id !== "number") continue;
    if (gezien.has(id)) {
      fouten.push(
        `Er zijn twee ${soort} met id ${id}. Id's moeten uniek zijn \u2014 anders is niet te zeggen op welke van beide een verwijzing slaat.`
      );
    }
    gezien.add(id);
  }
}
function teltLastMee(last, loadCases) {
  const proef = {
    nodes: [],
    beams: [],
    supports: [],
    plates: [],
    loadCases,
    loads: [last],
    selfWeightEnabled: false,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1
  };
  const mi = bouwMultiInput(proef);
  return mi.loads.length + (mi.pointLoads?.length ?? 0) + (mi.beamPointLoads?.length ?? 0) + (mi.thermalLoads?.length ?? 0) + (mi.edgeLoads?.length ?? 0) + (mi.edgePointLoads?.length ?? 0) > 0;
}
function alsModelInvoer(m) {
  const arr = (waarde) => Array.isArray(waarde) ? waarde : [];
  return {
    nodes: arr(m.nodes),
    beams: arr(m.beams),
    supports: arr(m.supports),
    plates: arr(m.plates),
    loadCases: arr(m.loadCases),
    loads: arr(m.loads),
    selfWeightEnabled: m.selfWeightEnabled === true,
    scheefstandEnabled: m.scheefstandEnabled === true,
    scheefstandNoemer: typeof m.scheefstandNoemer === "number" ? m.scheefstandNoemer : 200,
    scheefstandRichting: m.scheefstandRichting === -1 ? -1 : 1
  };
}
function gevallenMetLast(model) {
  const mi = bouwMultiInput(model);
  const ids = /* @__PURE__ */ new Set();
  const noteer = (caseId) => {
    if (typeof caseId === "number") ids.add(caseId);
  };
  for (const l of mi.loads) noteer(l.caseId);
  for (const l of mi.pointLoads ?? []) noteer(l.caseId);
  for (const l of mi.beamPointLoads ?? []) noteer(l.caseId);
  for (const l of mi.thermalLoads ?? []) noteer(l.caseId);
  for (const l of mi.edgeLoads ?? []) noteer(l.caseId);
  for (const l of mi.edgePointLoads ?? []) noteer(l.caseId);
  for (const p of mi.plates ?? []) noteer(p.selfWeightCaseId);
  return ids;
}
function samenhangendeDelen(knoopIds, verbindingen) {
  const ouder = /* @__PURE__ */ new Map();
  for (const id of knoopIds) ouder.set(id, id);
  const zoek = (a) => {
    let wortel = a;
    while (ouder.get(wortel) !== wortel) wortel = ouder.get(wortel);
    let loop = a;
    while (ouder.get(loop) !== wortel) {
      const volgende = ouder.get(loop);
      ouder.set(loop, wortel);
      loop = volgende;
    }
    return wortel;
  };
  for (const groep of verbindingen) {
    const aanwezig = groep.filter((id) => ouder.has(id));
    for (let i = 1; i < aanwezig.length; i++) {
      const a = zoek(aanwezig[0]);
      const b = zoek(aanwezig[i]);
      if (a !== b) ouder.set(b, a);
    }
  }
  const perWortel = /* @__PURE__ */ new Map();
  for (const id of knoopIds) {
    const wortel = zoek(id);
    const lijst = perWortel.get(wortel);
    if (lijst) lijst.push(id);
    else perWortel.set(wortel, [id]);
  }
  return [...perWortel.values()];
}
function valideerModel(rauw, opties = {}) {
  const veldFouten = controleerVelden(rauw);
  if (veldFouten.length > 0) {
    return { ok: false, errors: veldFouten, warnings: [] };
  }
  const errors = [];
  const warnings = [];
  const m = rauw;
  const nodes = m.nodes ?? [];
  const beams = m.beams ?? [];
  const supports = m.supports ?? [];
  const plates = m.plates ?? [];
  const loadCases = m.loadCases ?? [];
  const loads = m.loads ?? [];
  meldDubbeleIds(nodes, "knopen", errors);
  meldDubbeleIds(beams, "staven", errors);
  meldDubbeleIds(plates, "platen", errors);
  meldDubbeleIds(loadCases, "belastinggevallen", errors);
  meldDubbeleIds(loads, "lasten", errors);
  const knoopById = /* @__PURE__ */ new Map();
  for (const n of nodes) knoopById.set(n.id, { x: n.x, z: n.z });
  const caseIds = new Set(loadCases.map((lc) => lc.id));
  const beamIds = new Set(beams.map((b) => b.id));
  const plateIds = new Set(plates.map((p) => p.id));
  if (nodes.length === 0) errors.push("Het model bevat geen knopen.");
  if (beams.length === 0 && plates.length === 0) {
    errors.push("Het model bevat geen staven en geen platen \u2014 er valt niets te rekenen.");
  }
  if (loadCases.length === 0) {
    errors.push("Het model bevat geen belastinggevallen.");
  }
  for (const bevinding of zoekDubbeleKnopen({ nodes, beams }, 1e-6)) {
    errors.push(bevinding.tekst);
  }
  for (const b of beams) {
    const van = knoopById.get(b.from);
    const naar = knoopById.get(b.to);
    if (!van) errors.push(`Staaf ${b.id} verwijst naar knoop ${b.from}, die niet bestaat.`);
    if (!naar) errors.push(`Staaf ${b.id} verwijst naar knoop ${b.to}, die niet bestaat.`);
    if (b.from === b.to) {
      errors.push(`Staaf ${b.id} begint en eindigt op knoop ${b.from} \u2014 lengte nul.`);
    } else if (van && naar) {
      const lengte = Math.hypot(naar.x - van.x, naar.z - van.z);
      if (lengte < 1e-6) {
        errors.push(
          `Staaf ${b.id} heeft lengte nul: knoop ${b.from} en knoop ${b.to} liggen op dezelfde plek.`
        );
      }
    }
    if (resolveSection(b.material, b.profile).bron === "default") {
      errors.push(
        `Staaf ${b.id}: onbekende combinatie materiaal "${b.material ?? "(leeg)"}" + profiel "${b.profile ?? "(leeg)"}". De solver zou terugvallen op HEA 160 / S235 en met een andere doorsnede rekenen dan opgegeven.`
      );
    } else {
      const verloop = bepaalVerloop(b.material, b.profile, b.profileEnd);
      if (verloop.status === "fout") {
        errors.push(`Staaf ${b.id}: ${verloop.reden}.`);
      } else if (verloop.status === "verlopend" && plates.length > 0) {
        errors.push(
          `Staaf ${b.id} heeft een verlopend profiel ("${b.profile}" \u2192 "${b.profileEnd}") en het model bevat platen; dat wordt nog niet ondersteund. Maak de staaf prismatisch (verwijder \`profileEnd\`) of haal de platen uit het model.`
        );
      }
    }
    const dubbel = dubbelzinnigMateriaal(b.material);
    if (dubbel) {
      const metKorf = b.checkConfig?.betonKorf !== void 0 && b.checkConfig?.betonKorf !== null;
      (metKorf ? errors : warnings).push(dubbelzinnigMateriaalTekst(b.id, dubbel, metKorf));
    }
  }
  const actief2 = /* @__PURE__ */ new Set();
  for (const b of beams) {
    actief2.add(b.from);
    actief2.add(b.to);
  }
  for (const p of plates) for (const id of p.nodeIds ?? []) actief2.add(id);
  for (const n of nodes) {
    if (!actief2.has(n.id)) {
      warnings.push(
        // "Telt niet mee" klopte niet: in het raamwerkpad krijgt elke knoop
        // drie vrijheidsgraden, en een losse knoop maakt het stelsel dan
        // singulier (gemeten: de berekening faalt op die knoop).
        `Knoop ${n.id} hangt aan geen enkele staaf of plaat. Zo'n losse knoop draagt niets en maakt het stelsel singulier zodra hij kan bewegen of draaien \u2014 verwijder hem, of verbind hem met de constructie.`
      );
    }
  }
  const heeftPlaten = plates.length > 0;
  const gesteund = /* @__PURE__ */ new Set();
  const vastgezetteRichtingen = { x: [], z: [], ry: 0 };
  for (const s of supports) {
    if (!knoopById.has(s.nodeId)) {
      errors.push(`Oplegging op knoop ${s.nodeId}, die niet bestaat.`);
      continue;
    }
    if (!actief2.has(s.nodeId)) {
      const melding = `Oplegging op knoop ${s.nodeId}, die aan geen enkele staaf of plaat hangt. Die knoop zit niet in het rekenmodel, dus de oplegging doet niets.`;
      if (heeftPlaten) warnings.push(melding);
      else errors.push(melding);
      continue;
    }
    if (s.type === "zSpring" || s.type === "xSpring" || s.type === "rotSpring") {
      if (s.k === void 0 || s.k <= 0) {
        warnings.push(
          `Oplegging op knoop ${s.nodeId} is een veer zonder positieve stijfheid (\`k\`) en rekent daarom als een starre oplegging.`
        );
      }
    }
    gesteund.add(s.nodeId);
    const knoop = knoopById.get(s.nodeId);
    for (const richting2 of VASTGEZET[s.type] ?? []) {
      if (richting2 === "x") vastgezetteRichtingen.x.push(knoop.z);
      else if (richting2 === "z") vastgezetteRichtingen.z.push(knoop.x);
      else vastgezetteRichtingen.ry++;
    }
  }
  if (supports.length === 0) {
    errors.push(
      "Het model heeft geen opleggingen \u2014 voeg randvoorwaarden toe. Zonder opleggingen is de constructie een mechanisme."
    );
  } else {
    if (vastgezetteRichtingen.x.length === 0) {
      errors.push(
        "Geen enkele oplegging houdt de constructie in x-richting tegen \u2014 het geheel kan horizontaal wegschuiven (mechanisme)."
      );
    }
    if (vastgezetteRichtingen.z.length === 0) {
      errors.push(
        "Geen enkele oplegging houdt de constructie in z-richting tegen \u2014 het geheel kan verticaal zakken (mechanisme)."
      );
    }
    const tweeVerschillend = (waarden) => waarden.some((w) => Math.abs(w - waarden[0]) > 1e-6);
    const rotatieVerhinderd = vastgezetteRichtingen.ry > 0 || tweeVerschillend(vastgezetteRichtingen.z) || tweeVerschillend(vastgezetteRichtingen.x);
    if (!rotatieVerhinderd) {
      errors.push(
        "Niets verhindert dat de constructie als geheel roteert: er is geen inklemming of rotatieveer, en de opleggingen houden hem maar op \xE9\xE9n plaats per richting vast (mechanisme)."
      );
    }
  }
  if (actief2.size > 0) {
    const verbindingen = [
      ...beams.map((b) => [b.from, b.to]),
      ...plates.map((p) => p.nodeIds ?? [])
    ];
    for (const deel of samenhangendeDelen([...actief2], verbindingen)) {
      if (!deel.some((id) => gesteund.has(id))) {
        errors.push(
          `Het constructiedeel met knopen ${deel.slice(0, 6).join(", ")}${deel.length > 6 ? ", \u2026" : ""} heeft geen enkele oplegging en kan vrij bewegen (mechanisme).`
        );
      }
    }
  }
  for (const p of plates) {
    const hoeken = (p.nodeIds ?? []).map((id) => knoopById.get(id));
    if (hoeken.some((h) => !h)) {
      errors.push(`Plaat ${p.id}: \xE9\xE9n of meer hoekknopen bestaan niet.`);
      continue;
    }
    const punten = hoeken.map((h) => ({ x: h.x, z: h.z }));
    if (punten.length === 4 && isAsgelijndeRechthoek(punten, 1)) continue;
    const vormFout = valideerPlaatPolygoon(punten, 1);
    if (vormFout) {
      errors.push(`Plaat ${p.id}: ${vormFout}`);
      continue;
    }
    const meshSize = (p.meshSize ?? 0) > 0 ? p.meshSize : 500;
    const handtekening = berekenPlaatMeshSignatuur(punten, meshSize);
    const cache = p.meshCache && p.meshCache.signature === handtekening ? p.meshCache : void 0;
    if (!cache) {
      errors.push(
        `Plaat ${p.id} is geen asgelijnde rechthoek en rekent daarom als polygoonplaat, maar het CDT-rekenmesh ontbreekt of is verouderd. Reken via een projectbestand waarin het mesh is opgeslagen; de MCP-server genereert zelf geen meshes.`
      );
    }
  }
  for (const l of loads) {
    const id = l.id;
    if (!caseIds.has(l.caseId)) {
      errors.push(
        `Last ${id} verwijst naar belastinggeval ${l.caseId}, dat niet bestaat.`
      );
    }
    if (l.beamId !== void 0 && !beamIds.has(l.beamId)) {
      errors.push(`Last ${id} verwijst naar staaf ${l.beamId}, die niet bestaat.`);
    }
    if (l.plateId !== void 0 && !plateIds.has(l.plateId)) {
      errors.push(`Last ${id} verwijst naar plaat ${l.plateId}, die niet bestaat.`);
    } else if (l.plateId !== void 0) {
      const plaat = plates.find((p) => p.id === l.plateId);
      const hoeken = (plaat?.nodeIds ?? []).map((nid) => knoopById.get(nid));
      if (plaat && hoeken.every((h) => h !== void 0)) {
        const rand = bepaalPlaatRand(
          hoeken,
          { edge: l.edge, edgeIndex: l.edgeIndex },
          1
        );
        if (!rand.ok) errors.push(`Last ${id} op plaat ${l.plateId}: ${rand.reden}`);
      }
    }
    if (l.nodeId !== void 0) {
      if (!knoopById.has(l.nodeId)) {
        errors.push(`Last ${id} verwijst naar knoop ${l.nodeId}, die niet bestaat.`);
      } else if (!actief2.has(l.nodeId)) {
        errors.push(
          `Last ${id} staat op knoop ${l.nodeId}, die aan geen enkele staaf of plaat hangt. Die last valt bij het rekenen weg zonder melding.`
        );
      }
    }
    const heeftRandadres = l.edge !== void 0 || l.edgeIndex !== void 0;
    if (l.plateId !== void 0 && l.type !== "edgeLoad" && l.type !== "pointForce") {
      errors.push(
        `Last ${id} (type "${String(l.type)}") noemt een plaat (\`plateId\`), maar op een plaat kan alleen een randlast (edgeLoad) of een puntlast op een plaatrand (pointForce) staan. Deze last wordt daar niet meegerekend.`
      );
    }
    if (heeftRandadres && l.plateId === void 0) {
      errors.push(
        `Last ${id} noemt een plaatrand (\`edge\`/\`edgeIndex\`) maar geen plaat (\`plateId\`); die rand hoort bij niets en wordt niet meegerekend.`
      );
    }
    if (l.type === "pointForce" && l.plateId !== void 0) {
      if (l.nodeId !== void 0 || l.beamId !== void 0) {
        errors.push(
          `Last ${id} is een puntlast op plaat ${l.plateId} \xE9n noemt een ${l.nodeId !== void 0 ? "knoop" : "staaf"}. E\xE9n last hoort op \xE9\xE9n plek te staan: geef \xF3f \`plateId\` met een rand en \`posFrac\`, \xF3f een knoop of staaf.`
        );
      }
      if (l.posFrac === void 0) {
        errors.push(
          `Last ${id} is een puntlast op plaat ${l.plateId} zonder positie (\`posFrac\`: fractie 0..1 langs de rand vanaf de beginhoek). Een ontbrekende positie wordt niet als 0 gelezen; de berekening weigert hem.`
        );
      }
    }
    if (l.type === "edgeLoad" && (l.startFrac !== void 0 || l.endFrac !== void 0)) {
      const a = l.startFrac ?? 0;
      const b = l.endFrac ?? 1;
      if (!(a < b)) {
        errors.push(
          `Last ${id} (randlast): het belaste deel begint niet v\xF3\xF3r zijn einde (startFrac ${a}, endFrac ${b}). Een leeg of omgekeerd deel is geen last.`
        );
      }
    }
    if (!teltLastMee(l, loadCases)) {
      errors.push(
        `Last ${id} (type "${String(l.type)}") levert geen invoer voor de solver op en telt dus niet mee. Controleer of alle velden voor dit lasttype ingevuld zijn (een lijnlast heeft \`beamId\` en \`q\` nodig, een puntlast \`nodeId\` of \`beamId\` \u2014 of op een plaatrand \`plateId\`, een rand en \`posFrac\` \u2014, een thermische last \`beamId\` en \`deltaT\`, een randlast \`plateId\`, een rand en \`q\`).`
      );
    }
  }
  if (errors.length === 0) {
    const metLast = gevallenMetLast(alsModelInvoer(m));
    for (const lc of loadCases) {
      if (!metLast.has(lc.id)) {
        warnings.push(
          `Belastinggeval ${lc.id} ("${lc.name}") heeft geen werkzame last en wordt bij het rekenen overgeslagen; het telt als nulbijdrage in de combinaties.`
        );
      }
    }
  }
  if (opties.combinaties === void 0) {
    for (const lc of loadCases) {
      if (lc.type === void 0) {
        warnings.push(
          `Belastinggeval ${lc.id} ("${lc.name}") heeft geen \`type\`. Zonder type telt het geval in geen enkele standaardcombinatie mee, en kan het eigen gewicht er niet aan worden toegewezen.`
        );
      }
    }
  }
  const gevalMeldingen = meldingenBelastinggevallen({
    loadCases,
    combinations: opties.combinaties ?? [],
    alleCombinaties: opties.alleCombinaties,
    gevolgklasse: opties.gevolgklasse,
    loads,
    selfWeightEnabled: m.selfWeightEnabled === true,
    // Hout vraagt een UGT-combinatie met alleen blijvende belasting (k_mod,
    // EN 1995-1-1 3.1.3(2)); zie `meldingenBelastinggevallen`.
    metHout: (Array.isArray(m.beams) ? m.beams : []).some(
      (b) => typeof b?.material === "string" && matchSupportedTimberGrade(b.material) !== null
    )
  }).filter((mld) => opties.combinaties !== void 0 || mld.caseId === null);
  for (const mld of gevalMeldingen) {
    (mld.niveau === "fout" ? errors : warnings).push(mld.tekst);
  }
  return { ok: errors.length === 0, errors, warnings };
}

// src/mcp/protocol.ts
var SIDECAR_PROTOCOL = 1;
var SIDECAR_OPS = [
  "handshake",
  "validate",
  "solve",
  "check",
  "load_project"
];
function maakOk(id, result) {
  return { v: SIDECAR_PROTOCOL, id, ok: true, result };
}
function maakFout(id, code, melding, detail) {
  return detail === void 0 ? { v: SIDECAR_PROTOCOL, id, ok: false, error: { code, melding } } : { v: SIDECAR_PROTOCOL, id, ok: false, error: { code, melding, detail } };
}
function ontleedVerzoek(regel) {
  let rauw;
  try {
    rauw = JSON.parse(regel);
  } catch (err) {
    return {
      ok: false,
      antwoord: maakFout(
        0,
        "INVOER_ONGELDIG",
        "De regel is geen geldige JSON.",
        { originele_melding: String(err), regel_lengte: regel.length }
      )
    };
  }
  if (typeof rauw !== "object" || rauw === null || Array.isArray(rauw)) {
    return {
      ok: false,
      antwoord: maakFout(
        0,
        "INVOER_ONGELDIG",
        "Een verzoekregel moet een JSON-object zijn."
      )
    };
  }
  const obj = rauw;
  const id = typeof obj.id === "number" && Number.isFinite(obj.id) ? obj.id : 0;
  if (typeof obj.id !== "number" || !Number.isFinite(obj.id)) {
    return {
      ok: false,
      antwoord: maakFout(
        0,
        "INVOER_ONGELDIG",
        "Veld `id` ontbreekt of is geen eindig getal."
      )
    };
  }
  if (obj.v !== SIDECAR_PROTOCOL) {
    return {
      ok: false,
      antwoord: maakFout(
        id,
        "PROTOCOL_MISMATCH",
        `Deze sidecar spreekt protocolversie ${SIDECAR_PROTOCOL}; de aanroeper stuurde ${JSON.stringify(obj.v)}. Server en solverbundel horen bij elkaar \u2014 herbouw de MCP-server.`,
        { verwacht: SIDECAR_PROTOCOL, ontvangen: obj.v ?? null }
      )
    };
  }
  const op = obj.op;
  if (typeof op !== "string" || !SIDECAR_OPS.includes(op)) {
    return {
      ok: false,
      antwoord: maakFout(
        id,
        "INVOER_ONGELDIG",
        `Onbekende bewerking ${JSON.stringify(op)}. Bekend zijn: ${SIDECAR_OPS.join(", ")}.`
      )
    };
  }
  const payload = obj.payload ?? {};
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      antwoord: maakFout(
        id,
        "INVOER_ONGELDIG",
        "Veld `payload` moet een JSON-object zijn (of ontbreken)."
      )
    };
  }
  return {
    ok: true,
    verzoek: {
      v: SIDECAR_PROTOCOL,
      id,
      op,
      payload
    }
  };
}
function serialiseerAntwoord(antwoord) {
  try {
    return `${JSON.stringify(antwoord)}
`;
  } catch (err) {
    const id = antwoord.id;
    return `${JSON.stringify(
      maakFout(
        id,
        "INTERN",
        "Het antwoord kon niet als JSON worden weggeschreven.",
        { originele_melding: String(err) }
      )
    )}
`;
  }
}
function mapNaarObject(bron, vorm) {
  const uit = {};
  for (const [sleutel, waarde] of bron) uit[String(sleutel)] = vorm(waarde, sleutel);
  return uit;
}
function telNietEindig(waarde) {
  if (typeof waarde === "number") return Number.isFinite(waarde) ? 0 : 1;
  if (Array.isArray(waarde)) {
    let n = 0;
    for (const item of waarde) n += telNietEindig(item);
    return n;
  }
  if (typeof waarde === "object" && waarde !== null) {
    let n = 0;
    for (const item of Object.values(waarde)) {
      n += telNietEindig(item);
    }
    return n;
  }
  return 0;
}

// src/mcp/sidecar.ts
var naarKN = (n) => n / 1e3;
var naarKNm = (nmm) => nmm / 1e6;
var EENHEDEN = {
  kracht: "kN",
  moment: "kNm",
  verplaatsing: "mm",
  rotatie: "rad",
  teken: "N positief = trek; z positief omhoog"
};
function zelfHash() {
  const haal = process.getBuiltinModule;
  const pad = process.argv[1];
  if (typeof haal !== "function" || !pad) return null;
  try {
    const fs = haal("node:fs");
    const crypto = haal("node:crypto");
    const bytes = fs.readFileSync(pad);
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return null;
  }
}
var InvoerFout = class extends Error {
  constructor(melding, detail) {
    super(melding);
    this.detail = detail;
  }
};
var BestandFout = class extends Error {
  constructor(melding, detail) {
    super(melding);
    this.detail = detail;
  }
};
var ModelFout = class extends Error {
};
function eisObject(waarde, veld) {
  if (typeof waarde !== "object" || waarde === null || Array.isArray(waarde)) {
    throw new InvoerFout(`Veld \`${veld}\` moet een JSON-object zijn.`);
  }
  return waarde;
}
function eisArray(waarde, veld) {
  if (!Array.isArray(waarde)) {
    throw new InvoerFout(`Veld \`${veld}\` moet een array zijn.`);
  }
  return waarde;
}
function leesTekst(payload, veld) {
  const waarde = payload[veld];
  if (typeof waarde !== "string" || waarde.length === 0) {
    throw new InvoerFout(`Veld \`${veld}\` ontbreekt of is geen tekst.`);
  }
  return waarde;
}
function leesScheefstand(rauw, model, opgegevenNoemer) {
  const bronRauw = rauw.scheefstandBron;
  if (bronRauw !== void 0 && bronRauw !== null && !SCHEEFSTAND_BRONNEN.includes(bronRauw)) {
    throw new InvoerFout(
      `\`scheefstandBron\` is "${String(bronRauw)}"; bekend zijn ` + SCHEEFSTAND_BRONNEN.map((b) => `"${b}"`).join(", ") + ". Een onbekende bron wordt geweigerd, niet stil als vaste noemer gerekend."
    );
  }
  const bron = bronRauw ?? "vast";
  const hoogte = rauw.scheefstandHoogteM;
  if (hoogte !== void 0 && hoogte !== null && !(typeof hoogte === "number" && Number.isFinite(hoogte) && hoogte > 0)) {
    throw new InvoerFout(
      "`scheefstandHoogteM` moet een getal groter dan 0 zijn (hoogte h in m), of null om h uit het model af te leiden."
    );
  }
  const aantal = rauw.scheefstandAantalElementen;
  if (aantal !== void 0 && aantal !== null && !(typeof aantal === "number" && Number.isInteger(aantal) && aantal >= 1)) {
    throw new InvoerFout(
      "`scheefstandAantalElementen` moet een geheel getal van minstens 1 zijn (aantal dragende verticale elementen m), of null om m uit het model af te leiden."
    );
  }
  const keuze = {
    scheefstandBron: bron,
    scheefstandHoogteM: typeof hoogte === "number" ? hoogte : null,
    scheefstandAantalElementen: typeof aantal === "number" ? aantal : null
  };
  if (rauw.scheefstandEnabled !== true || bron === "vast") {
    return { noemer: opgegevenNoemer, meldingen: [], keuze };
  }
  const geometrie = leidScheefstandGeometrieAf({
    nodes: model.nodes,
    beams: model.beams,
    supports: model.supports
  });
  const uit = bepaalScheefstand(
    {
      bron,
      noemer: opgegevenNoemer,
      hoogteM: keuze.scheefstandHoogteM,
      aantalElementen: keuze.scheefstandAantalElementen
    },
    geometrie,
    toepasselijkeScheefstandNormen(model.beams)
  );
  const herkomst = uit.norm ? `${SCHEEFSTAND_BRON_LABEL[uit.bron]}` + (uit.bron === "ongunstigste" ? ` (${SCHEEFSTAND_BRON_LABEL[uit.norm]})` : "") + `, h = ${uit.hoogteM} m, m = ${uit.aantalElementen}` : SCHEEFSTAND_BRON_LABEL[uit.bron];
  const meldingen = [
    `Scheefstand: \u03C6 = 1/${uit.noemer.toFixed(1)} volgens ${herkomst} \u2014 dezelfde afleiding als de app; de noemer ${opgegevenNoemer} uit het bestand telt bij deze normkeuze niet.`,
    ...uit.waarschuwingen.map((w) => `Scheefstand: ${w}`)
  ];
  return { noemer: uit.noemer, meldingen, keuze };
}
function alsGevolgklasse(x) {
  return GEVOLGKLASSEN.includes(x) ? x : null;
}
function leesModel(payload) {
  const heeftModel = payload.model !== void 0;
  const heeftProject = payload.project !== void 0;
  if (heeftModel === heeftProject) {
    throw new InvoerFout(
      "Geef precies \xE9\xE9n van `model` (het model zelf) of `project` (de inhoud van een .ifcfem2d-bestand)."
    );
  }
  if (heeftProject) {
    const project = eisObject(payload.project, "project");
    const inhoud = leesTekst(project, "inhoud");
    let bestand;
    try {
      bestand = deserializeProject(inhoud);
    } catch (err) {
      throw new BestandFout(
        "Het projectbestand kon niet worden gelezen.",
        { originele_melding: String(err) }
      );
    }
    const uitBestand = {
      nodes: bestand.nodes ?? [],
      beams: bestand.beams ?? [],
      supports: bestand.supports ?? [],
      plates: bestand.plates ?? [],
      loadCases: bestand.loadCases ?? [],
      loads: bestand.loads ?? [],
      selfWeightEnabled: bestand.selfWeightEnabled ?? false,
      scheefstandEnabled: bestand.scheefstandEnabled ?? false,
      scheefstandNoemer: bestand.scheefstandNoemer ?? 200,
      scheefstandRichting: bestand.scheefstandRichting ?? 1
    };
    const scheef2 = leesScheefstand(
      bestand,
      uitBestand,
      uitBestand.scheefstandNoemer
    );
    uitBestand.scheefstandNoemer = scheef2.noemer;
    return {
      model: uitBestand,
      // De arrays zijn dezelfde objecten als in het bestand, dus een onbekend
      // veld BINNEN een knoop, staaf of last blijft zichtbaar voor de validatie.
      rauw: uitBestand,
      scheefstandMeldingen: scheef2.meldingen,
      scheefstandKeuze: scheef2.keuze,
      beams: bestand.beams ?? [],
      combinatiesUitBestand: combinationsFromFile(bestand.combinations) ?? null,
      nonlinearUitBestand: bestand.nonlinearEnabled ?? null,
      formatVersion: bestand.version,
      gevolgklasseUitBestand: alsGevolgklasse(
        bestand.projectInfo?.uitgangspunten?.gevolgklasse
      ),
      idTellersUitBestand: bestand.idTellers
    };
  }
  const rauw = eisObject(payload.model, "model");
  const beams = eisArray(rauw.beams ?? [], "model.beams");
  for (const beam of beams) {
    const b = beam;
    for (const veld of ["E", "A", "I"]) {
      if (b[veld] !== void 0) {
        throw new InvoerFout(
          `Staaf ${String(b.id)} geeft \`${veld}\` rechtstreeks op. Dat wordt niet ondersteund: de doorsnede volgt uit \`material\` en \`profile\`, zodat er \xE9\xE9n bron voor A en I is.`
        );
      }
    }
  }
  const model = {
    nodes: eisArray(rauw.nodes ?? [], "model.nodes"),
    beams,
    supports: eisArray(
      rauw.supports ?? [],
      "model.supports"
    ),
    plates: eisArray(rauw.plates ?? [], "model.plates"),
    loadCases: eisArray(
      rauw.loadCases ?? [],
      "model.loadCases"
    ),
    loads: eisArray(rauw.loads ?? [], "model.loads"),
    selfWeightEnabled: rauw.selfWeightEnabled === true,
    scheefstandEnabled: rauw.scheefstandEnabled === true,
    scheefstandNoemer: typeof rauw.scheefstandNoemer === "number" ? rauw.scheefstandNoemer : 200,
    scheefstandRichting: rauw.scheefstandRichting === -1 ? -1 : 1
  };
  const scheef = leesScheefstand(rauw, model, model.scheefstandNoemer);
  model.scheefstandNoemer = scheef.noemer;
  return {
    model,
    rauw,
    beams,
    combinatiesUitBestand: null,
    nonlinearUitBestand: null,
    formatVersion: null,
    gevolgklasseUitBestand: null,
    idTellersUitBestand: void 0,
    scheefstandMeldingen: scheef.meldingen,
    scheefstandKeuze: scheef.keuze
  };
}
function leesGevolgklasse(payload, gelezen) {
  if (payload.gevolgklasse !== void 0 && alsGevolgklasse(payload.gevolgklasse) === null) {
    throw new InvoerFout('Veld `gevolgklasse` moet "CC1", "CC2" of "CC3" zijn.');
  }
  const { klasse, bron } = gevolgklasseBijOpenen({
    bestand: gelezen.gevolgklasseUitBestand,
    verzoek: alsGevolgklasse(payload.gevolgklasse),
    combinations: gelezen.combinatiesUitBestand,
    terugval: STANDAARD_GEVOLGKLASSE
  });
  return { klasse, aangenomen: bron === "terugval", bron };
}
function gevolgklasseWaarschuwing(k, metStandaard) {
  if (!metStandaard) return null;
  if (k.bron === "terugval") {
    return "Geen gevolgklasse opgegeven (niet in de projectgegevens en niet als `gevolgklasse`): de standaardcombinaties zijn opgesteld voor CC2, met de factoren van NEN-EN 1990 NB tabel NB.4.";
  }
  if (k.bron === "kenmerk") {
    return `Geen gevolgklasse in de projectgegevens of als \`gevolgklasse\`: de klasse ${k.klasse} komt uit het kenmerk van de standaardcombinaties in het projectbestand, met de factoren van NEN-EN 1990 ${PARTIELE_FACTOREN[k.klasse].bron}.`;
  }
  return null;
}
function leesCombinaties(payload, gelezen, gevolgklasse) {
  if (payload.combinations !== void 0) {
    const rauw = eisArray(payload.combinations, "combinations");
    const uit = combinationsFromFile(
      rauw
    );
    if (!uit) throw new InvoerFout("Veld `combinations` is geen geldige lijst.");
    return { lijst: uit, bron: "verzoek", openMeldingen: [] };
  }
  if (gelezen.combinatiesUitBestand) {
    const { staat, afwijking, vervanging } = openCombinatieStaat({
      loadCases: gelezen.model.loadCases,
      combinations: gelezen.combinatiesUitBestand,
      gevolgklasse,
      idTellers: gelezen.idTellersUitBestand
    });
    return {
      lijst: staat.combinations,
      bron: "bestand",
      openMeldingen: [vervanging?.samenvatting, afwijking?.samenvatting].filter((x) => typeof x === "string" && x !== "")
    };
  }
  return {
    lijst: defaultCombinations(gelezen.model.loadCases, gevolgklasse),
    bron: "standaard",
    openMeldingen: []
  };
}
function leesProfielen(payload) {
  const db = /* @__PURE__ */ new Map();
  if (payload.profiles === void 0) return db;
  for (const item of eisArray(payload.profiles, "profiles")) {
    const profiel = item;
    if (!profiel || typeof profiel.name !== "string") {
      throw new InvoerFout("Elk item in `profiles` heeft een `name` nodig.");
    }
    const sleutel = profileLookupKey(profiel.name);
    if (!db.has(sleutel)) db.set(sleutel, profiel);
  }
  return db;
}
function leesHoutklassen(payload) {
  if (payload.timber_grades === void 0) return null;
  const lijst = eisArray(payload.timber_grades, "timber_grades");
  if (!lijst.every((g) => typeof g === "string")) {
    throw new InvoerFout("Elk item in `timber_grades` moet tekst zijn.");
  }
  return lijst;
}
function pasCheckConfigToe(beams, payload) {
  if (payload.check_config === void 0) return beams;
  const configs = eisObject(payload.check_config, "check_config");
  const bestaand = new Set(beams.map((b) => String(b.id)));
  const fouten = [];
  for (const [sleutel, cc] of Object.entries(configs)) {
    if (!bestaand.has(sleutel)) {
      fouten.push(
        `check_config.${sleutel}: het model heeft geen staaf met dit nummer; deze instellingen zouden nergens worden toegepast.`
      );
    }
    fouten.push(...keurCheckConfig(cc, `check_config.${sleutel}`));
  }
  if (fouten.length > 0) {
    throw new InvoerFout(
      `\`check_config\` bevat ${fouten.length} invoerfout(en) \u2014 zie \`detail.fouten\`. Een onbekend veld of staafnummer wordt geweigerd, niet genegeerd: genegeerd levert het een toetsing op met de standaardwaarde in plaats van de bedoelde instelling.`,
      { fouten }
    );
  }
  return beams.map((beam) => {
    const extra = configs[String(beam.id)];
    if (extra === void 0) return beam;
    return {
      ...beam,
      checkConfig: {
        ...beam.checkConfig ?? {},
        ...eisObject(extra, `check_config.${beam.id}`)
      }
    };
  });
}
function vormStaafkrachten(ef, metStations) {
  const basis = {
    N: naarKN(ef.N),
    V: naarKN(ef.V),
    M_start: naarKNm(ef.M_start),
    M_end: naarKNm(ef.M_end),
    L_mm: ef.L_mm
  };
  if (!metStations) return basis;
  return {
    ...basis,
    stations_mm: ef.stations_mm,
    N_x: ef.normalForce.map(naarKN),
    V_x: ef.shearForce.map(naarKN),
    M_x: ef.bendingMoment.map(naarKNm),
    w_x: ef.deflection,
    u_x: ef.axialDisp,
    // Hoekverdraaiing θ(x) = dw/dx per station, in RAD — dezelfde eenheid als
    // `displacements.ry` en als `units.rotatie`, dus geen omrekening. Positief
    // = tegen de klok in; bij een stijve aansluiting is θ op een staafeinde
    // gelijk aan de ry van de aanliggende knoop.
    theta_x: ef.rotation ?? []
  };
}
function vormResultaat(res, metStations) {
  return {
    reactions: mapNaarObject(res.reactions, (r) => ({
      fx: naarKN(r.fx),
      fz: naarKN(r.fz),
      my: naarKNm(r.my)
    })),
    displacements: mapNaarObject(res.displacements, (d) => ({
      ux: d.ux,
      uz: d.uz,
      ry: d.ry
    })),
    elements: mapNaarObject(res.elements, (ef) => vormStaafkrachten(ef, metStations)),
    maxDisplacement: res.maxDisplacement
  };
}
function vormEnvelop(env) {
  return {
    elements: mapNaarObject(env.elements, (e) => ({
      N_min: naarKN(e.N_min),
      N_max: naarKN(e.N_max),
      V_min: naarKN(e.V_min),
      V_max: naarKN(e.V_max),
      M_min: naarKNm(e.M_min),
      M_max: naarKNm(e.M_max),
      governingCombinationId: e.governingCombinationId,
      governingMAbs: naarKNm(e.governingMAbs),
      // Positie van governingMAbs langs de staaf (mm vanaf de startknoop).
      // De omhullende leest het volledige stationsraster, dus dat maximum
      // ligt zelden op een uiteinde; zonder deze waarde is niet af te leiden
      // waar het maatgevende moment optreedt.
      governingMPos_mm: e.governingMPos_mm
    })),
    reactions: mapNaarObject(env.reactions, (r) => ({
      fx_min: naarKN(r.fx_min),
      fx_max: naarKN(r.fx_max),
      fz_min: naarKN(r.fz_min),
      fz_max: naarKN(r.fz_max)
    })),
    maxDisplacement: env.maxDisplacement,
    maxDisplacementCombinationId: env.maxDisplacementCombinationId
  };
}
function opHandshake() {
  return {
    protocol: SIDECAR_PROTOCOL,
    node_version: `v${process.versions.node}`,
    bundle_version: version,
    bundle_hash: zelfHash(),
    project_format_version: PROJECT_FORMAT_VERSION,
    ops: [...SIDECAR_OPS]
  };
}
function rekenDoor(payload) {
  const gelezen = leesModel(payload);
  const veldFouten = controleerVelden(gelezen.rauw);
  if (veldFouten.length > 0) {
    throw new InvoerFout(
      `Het model bevat ${veldFouten.length} invoerfout(en) \u2014 zie \`detail.fouten\`. Onbekende velden worden geweigerd, niet genegeerd: een genegeerd veld levert een geslaagde berekening op die bij een ander model hoort.`,
      { fouten: veldFouten }
    );
  }
  const klasseGelezen = leesGevolgklasse(payload, gelezen);
  const gevolgklasse = klasseGelezen.klasse;
  const gelezenCombinaties = leesCombinaties(payload, gelezen, gevolgklasse);
  const combinatieBron = gelezenCombinaties.bron;
  const alleCombinaties = gelezenCombinaties.lijst;
  const selectie = selecteerCombinaties(
    alleCombinaties,
    gelezen.beams,
    gelezen.model.plates,
    { loadCases: gelezen.model.loadCases, gevolgklasse }
  );
  const combinaties = metScheefstandRichtingen(
    selectie.actief,
    gelezen.model.scheefstandEnabled,
    gelezen.model.scheefstandRichting
  );
  const profileDb = leesProfielen(payload);
  const nonlinear = gelezen.nonlinearUitBestand !== null ? gelezen.nonlinearUitBestand : payload.nonlinear === true;
  const detail = payload.detail ?? "samenvatting";
  if (detail !== "samenvatting" && detail !== "stations") {
    throw new InvoerFout(
      'Veld `detail` moet "samenvatting" of "stations" zijn.'
    );
  }
  const metStations = detail === "stations";
  const multiInput = bouwMultiInput(gelezen.model);
  const start = Date.now();
  let perCaseResultaat;
  try {
    perCaseResultaat = nonlinear ? solveAllCasesNonlinear(multiInput) : solveAllCases(multiInput);
  } catch (err) {
    throw new ModelFout(String(err?.message ?? err));
  }
  const { perCase } = perCaseResultaat;
  let combinationResults;
  let envelope;
  try {
    combinationResults = new Map(
      combinaties.map((c) => [c.id, combineResults(c, perCase)])
    );
    envelope = computeEnvelope(combinaties, perCase);
  } catch (err) {
    throw new ModelFout(String(err?.message ?? err));
  }
  const solveMs = Date.now() - start;
  const analysetype = nonlinear ? "tweedeOrdeGeometrisch" : "eersteOrde";
  const stabiliteit = bepaalAlphaCr(multiInput, combinaties, combinationResults);
  const stabiliteitMeldingen = stabiliteitsMeldingen(
    stabiliteit,
    analysetype,
    gelezen.model.scheefstandEnabled
  );
  const gevraagd = gelezen.model.loadCases.map((lc) => lc.id);
  const opgelost = [...gevalResultaten(perCase).keys()];
  const legeGevallen = gevraagd.filter((id) => !perCase.has(id));
  const teToetsen = pasCheckConfigToe(gelezen.beams, payload);
  const gevraagdeIds = payload.beam_ids === void 0 ? [] : eisArray(payload.beam_ids, "beam_ids").map(Number);
  const beamIds = gevraagdeIds.length === 0 ? null : new Set(gevraagdeIds);
  const staafSelectie = beamIds === null ? teToetsen : teToetsen.filter((b) => beamIds.has(b.id));
  const inModel = new Set(gelezen.beams.map((b) => b.id));
  const onbekendeIds = [...new Set(gevraagdeIds)].filter((id) => !inModel.has(id));
  const staal = buildSteelCheckInputs({
    nodes: gelezen.model.nodes,
    beams: staafSelectie,
    // Het hele model, ook buiten `beam_ids`: een doorgaande lijn en een vrij
    // staafeind worden op alle staven herkend (`lib/doorgaandeLijn.ts`).
    alleBeams: teToetsen,
    plates: gelezen.model.plates,
    // Nodig om een tussensteunpunt te onderscheiden van een knoop waar een
    // ligger alleen is doorgeknipt; zonder deze lijst zou de doorbuigingstoets
    // dat verschil niet kunnen melden.
    supports: gelezen.model.supports,
    combinations: combinaties,
    combinationResults,
    profileDb,
    gevolgklasse,
    stabiliteit: { analysetype, alphaCr: stabiliteit, scheefstandAan: gelezen.model.scheefstandEnabled }
  });
  const houtklassen = leesHoutklassen(payload);
  const houtData = {
    nodes: gelezen.model.nodes,
    supports: gelezen.model.supports,
    combinations: combinaties,
    combinationResults,
    supportedGrades: houtklassen ?? void 0,
    loadCases: gelezen.model.loadCases,
    gevallenMetLast: opgelost
  };
  const hout = buildTimberCheckInputs({
    ...houtData,
    beams: staafSelectie.filter((b) => !isCltProfiel(b.profile))
  });
  const clt = buildCltCheckInputs({ ...houtData, beams: staafSelectie });
  const metHout = gelezen.beams.some((b) => matchSupportedTimberGrade(b.material) !== null);
  const waarschuwingen = [];
  if (houtklassen === null && metHout) {
    waarschuwingen.push(
      "Geen houtsterkteklassen meegegeven (`timber_grades`); de bundel valt terug op zijn eigen lijst, die uit de pas kan lopen met de rekenkern."
    );
  }
  if (profileDb.size === 0) {
    waarschuwingen.push(
      "Geen profieldatabase meegegeven (`profiles`); `steel_check_inputs` blijft daardoor leeg. Lever de lijst uit de staalprofielendatabase mee."
    );
  }
  waarschuwingen.push(...gelezen.scheefstandMeldingen);
  if (legeGevallen.length > 0) {
    waarschuwingen.push(
      `Belastinggeval(len) ${legeGevallen.join(", ")} zonder werkzame last overgeslagen; ze tellen als nulbijdrage in de combinaties.`
    );
  }
  for (const weg of selectie.overgeslagen) {
    waarschuwingen.push(`Combinatie ${weg.id} overgeslagen \u2014 ${weg.reden}`);
  }
  const klasseMelding = gevolgklasseWaarschuwing(
    klasseGelezen,
    combinatieBron === "standaard" || alleCombinaties.some((c) => c.standaard)
  );
  if (klasseMelding) waarschuwingen.push(klasseMelding);
  waarschuwingen.push(...gelezenCombinaties.openMeldingen);
  for (const m of stabiliteitMeldingen) {
    waarschuwingen.push(m.niveau === "fout" ? `FOUT: ${m.tekst}` : m.tekst);
  }
  for (const m of meldingenBelastinggevallen({
    loadCases: gelezen.model.loadCases,
    combinations: combinaties,
    alleCombinaties,
    gevolgklasse,
    loads: gelezen.model.loads,
    selfWeightEnabled: gelezen.model.selfWeightEnabled,
    metHout
  })) {
    waarschuwingen.push(m.niveau === "fout" ? `FOUT: ${m.tekst}` : m.tekst);
  }
  return {
    combinaties,
    combinatiesOvergeslagen: selectie.overgeslagen,
    combinationResults,
    envelope,
    perCase,
    metStations,
    nonlinear,
    solveMs,
    gevraagd,
    opgelost,
    legeGevallen,
    staal,
    hout,
    clt,
    onbekendeIds,
    waarschuwingen,
    formatVersion: gelezen.formatVersion,
    stabiliteit: {
      analysis_type: analysetype,
      alpha_cr: stabiliteit.map((u) => ({
        combination_id: u.combinatieId,
        name: u.naam,
        alpha_cr: u.alphaCr,
        status: u.status,
        ...u.grens !== void 0 ? { bound: u.grens } : {},
        ...u.reden !== void 0 ? { reason: u.reden } : {},
        label: alphaCrLabel(u)
      }))
    }
  };
}
function redenBestaatNiet(id) {
  return `bestaat niet in het model \u2014 staaf ${id} is gevraagd in \`beam_ids\`, maar het model heeft geen staaf met dit nummer; er is niets getoetst`;
}
function eenmaalPerStaaf(lijst, getoetst) {
  const gezien = /* @__PURE__ */ new Set();
  const uit = [];
  for (const s of lijst) {
    if (getoetst.has(s.beam_id) || gezien.has(s.beam_id)) continue;
    gezien.add(s.beam_id);
    uit.push(s);
  }
  return uit;
}
function opSolve(payload) {
  const d = rekenDoor(payload);
  const antwoord = {
    solver_version: version,
    bundle_hash: zelfHash(),
    units: EENHEDEN,
    nonlinear_used: d.nonlinear,
    cases_requested: d.gevraagd,
    cases_solved: d.opgelost,
    cases_skipped_empty: d.legeGevallen,
    // Combinaties die dit model niet nodig heeft — zelfde gedachte als
    // `cases_skipped_empty`: een ontbrekende sleutel in `combinations` leest
    // anders als "nul" in plaats van als "niet berekend, en wel hierom".
    combinations_skipped: d.combinatiesOvergeslagen.map(
      (c) => ({
        id: c.id,
        name: c.naam,
        reason: c.reden
      })
    ),
    per_case: mapNaarObject(gevalResultaten(d.perCase), (r) => vormResultaat(r, d.metStations)),
    combinations: mapNaarObject(
      d.combinationResults,
      (r) => vormResultaat(r, d.metStations)
    ),
    envelope: vormEnvelop(d.envelope),
    // α_cr per UGT-combinatie; een waarde onder 10 bij eerste orde staat ook
    // als FOUT in `warnings` (NEN-EN 1993-1-1 5.2.1(3)).
    stability: d.stabiliteit,
    steel_check_inputs: d.staal.inputs,
    skipped_beams: d.staal.skipped.map((s) => ({
      beam_id: s.beamId,
      reason: s.reason
    })),
    warnings: d.waarschuwingen,
    solve_ms: d.solveMs
  };
  const ontspoord = telNietEindig(antwoord.per_case) + telNietEindig(antwoord.combinations) + telNietEindig(antwoord.envelope);
  if (ontspoord > 0) {
    antwoord.warnings.push(
      `${ontspoord} resultaatwaarde(n) zijn NaN of oneindig. JSON schrijft die als null weg, wat als nul kan worden gelezen \u2014 vertrouw dit resultaat niet.`
    );
  }
  return antwoord;
}
function opCheck(payload) {
  const d = rekenDoor(payload);
  return {
    solve_summary: {
      cases_requested: d.gevraagd,
      cases_solved: d.opgelost,
      cases_skipped_empty: d.legeGevallen,
      combinations_skipped: d.combinatiesOvergeslagen.map(
        (c) => ({
          id: c.id,
          name: c.naam,
          reason: c.reden
        })
      ),
      nonlinear_used: d.nonlinear,
      solve_ms: d.solveMs
    },
    units: EENHEDEN,
    stability: d.stabiliteit,
    steel_check_inputs: d.staal.inputs,
    // Het bestaan van deze twee sleutels zegt de server dat deze bundel hout
    // toetsbaar maakt; een oudere bundel heeft ze niet, en dan meldt de server
    // dat in `skipped_beams` in plaats van "nul houtstaven" te lezen.
    timber_check_inputs: d.hout.inputs,
    clt_check_inputs: d.clt.inputs,
    // Elk gevraagd nummer staat in de toetsinvoer of hier — ook een nummer dat
    // geen staaf is — en elk maar één keer.
    skipped_beams: eenmaalPerStaaf(
      [...d.staal.skipped, ...d.hout.skipped, ...d.clt.skipped].map((s) => ({ beam_id: s.beamId, reason: s.reason })).concat(d.onbekendeIds.map((id) => ({ beam_id: id, reason: redenBestaatNiet(id) }))),
      new Set([...d.staal.inputs, ...d.hout.inputs, ...d.clt.inputs].map((i) => i.beam_id))
    ),
    warnings: d.waarschuwingen
  };
}
function opValidate(payload) {
  const gelezen = leesModel(payload);
  const { klasse } = leesGevolgklasse(payload, gelezen);
  const { lijst, openMeldingen } = leesCombinaties(payload, gelezen, klasse);
  const actief2 = selecteerCombinaties(lijst, gelezen.beams, gelezen.model.plates, {
    loadCases: gelezen.model.loadCases,
    gevolgklasse: klasse
  }).actief;
  const uitkomst = valideerModel(gelezen.rauw, {
    combinaties: actief2,
    alleCombinaties: lijst,
    gevolgklasse: klasse
  });
  return {
    ok: uitkomst.ok,
    errors: uitkomst.errors,
    warnings: [...openMeldingen, ...uitkomst.warnings],
    counts: {
      nodes: gelezen.model.nodes.length,
      beams: gelezen.model.beams.length,
      supports: gelezen.model.supports.length,
      plates: gelezen.model.plates.length,
      loads: gelezen.model.loads.length,
      load_cases: gelezen.model.loadCases.length
    }
  };
}
function opLoadProject(payload) {
  const gelezen = leesModel({
    project: { inhoud: leesTekst(payload, "inhoud") }
  });
  const m = gelezen.model;
  const klasse = leesGevolgklasse({}, gelezen);
  const { lijst, bron, openMeldingen } = leesCombinaties({}, gelezen, klasse.klasse);
  const warnings = [];
  const klasseMelding = gevolgklasseWaarschuwing(
    klasse,
    bron === "standaard" || lijst.some((c) => c.standaard)
  );
  if (klasseMelding) warnings.push(klasseMelding);
  warnings.push(...openMeldingen);
  warnings.push(...gelezen.scheefstandMeldingen);
  for (const mld of meldingenBelastinggevallen({
    loadCases: m.loadCases,
    combinations: lijst,
    alleCombinaties: lijst,
    gevolgklasse: klasse.klasse,
    loads: m.loads,
    selfWeightEnabled: m.selfWeightEnabled,
    metHout: gelezen.beams.some((b) => matchSupportedTimberGrade(b.material) !== null)
  })) {
    warnings.push(mld.niveau === "fout" ? `FOUT: ${mld.tekst}` : mld.tekst);
  }
  return {
    path: typeof payload.path === "string" ? payload.path : null,
    format_version: gelezen.formatVersion,
    supported_format_version: PROJECT_FORMAT_VERSION,
    // `scheefstandNoemer` is hier de GEREKENDE noemer (na de normkeuze); de
    // keuze zelf gaat mee, zodat het model heen en weer kan zonder dat de
    // norm onderweg verdwijnt.
    model: { ...m, ...gelezen.scheefstandKeuze },
    combinations: lijst.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      formula: c.formula,
      factors: Object.fromEntries([...c.factors].map(([k, v]) => [String(k), v]))
    })),
    combinations_source: bron,
    gevolgklasse: klasse.klasse,
    nonlinear_enabled: gelezen.nonlinearUitBestand,
    counts: {
      nodes: m.nodes.length,
      beams: m.beams.length,
      supports: m.supports.length,
      plates: m.plates.length,
      loads: m.loads.length,
      load_cases: m.loadCases.length,
      combinations: lijst.length
    },
    warnings
  };
}
function verwerkVerzoek(verzoek) {
  try {
    switch (verzoek.op) {
      case "handshake":
        return maakOk(verzoek.id, opHandshake());
      case "solve":
        return maakOk(verzoek.id, opSolve(verzoek.payload));
      case "check":
        return maakOk(verzoek.id, opCheck(verzoek.payload));
      case "load_project":
        return maakOk(verzoek.id, opLoadProject(verzoek.payload));
      case "validate":
        return maakOk(verzoek.id, opValidate(verzoek.payload));
    }
  } catch (err) {
    if (err instanceof InvoerFout) {
      return maakFout(verzoek.id, "INVOER_ONGELDIG", err.message, err.detail);
    }
    if (err instanceof BestandFout) {
      return maakFout(verzoek.id, "BESTAND_ONLEESBAAR", err.message, err.detail);
    }
    if (err instanceof DoorsnedeOnbekendFout) {
      return maakFout(verzoek.id, "DOORSNEDE_ONBEKEND", err.message, {
        staven: err.staven.map((s) => ({ beam_id: s.beamId, reason: s.reden }))
      });
    }
    if (err instanceof ModelFout) {
      const afgebeeld = beeldKernfoutAf(err.message);
      return maakFout(
        verzoek.id,
        afgebeeld.code,
        afgebeeld.melding,
        afgebeeld.detail
      );
    }
    return maakFout(
      verzoek.id,
      "INTERN",
      "Onverwachte fout in de sidecar.",
      { originele_melding: String(err?.stack ?? err) }
    );
  }
}
function verwerkRegel(regel) {
  const opgeschoond = regel.replace(/\r$/, "");
  if (opgeschoond.trim().length === 0) return null;
  const ontleed = ontleedVerzoek(opgeschoond);
  const antwoord = ontleed.ok ? verwerkVerzoek(ontleed.verzoek) : ontleed.antwoord;
  return serialiseerAntwoord(antwoord);
}
function leidConsoleOm() {
  const naarStderr = (...delen) => {
    process.stderr.write(
      `${delen.map((d) => typeof d === "string" ? d : JSON.stringify(d)).join(" ")}
`
    );
  };
  console.log = naarStderr;
  console.info = naarStderr;
  console.debug = naarStderr;
  console.warn = naarStderr;
  console.error = naarStderr;
}
function startSidecar() {
  leidConsoleOm();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (brok) => {
    buffer += brok ?? "";
    let grens = buffer.indexOf("\n");
    while (grens >= 0) {
      const regel = buffer.slice(0, grens);
      buffer = buffer.slice(grens + 1);
      const antwoord = verwerkRegel(regel);
      if (antwoord !== null) process.stdout.write(antwoord);
      grens = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    const antwoord = verwerkRegel(buffer);
    if (antwoord !== null) process.stdout.write(antwoord);
    buffer = "";
    process.exitCode = 0;
  });
  process.stdin.resume();
}
function draaitAlsHoofdmodule() {
  const pad = process.argv[1];
  if (!pad) return false;
  try {
    const eigen = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1").toLowerCase();
    return pad.replace(/\\/g, "/").toLowerCase() === eigen;
  } catch {
    return false;
  }
}
if (process.argv.includes("--sidecar") || draaitAlsHoofdmodule()) {
  startSidecar();
}
export {
  ALPHA_CR_GRENS_EERSTE_ORDE,
  ALPHA_CR_MAX_DOFS,
  ALPHA_CR_ZOEKGRENS,
  ANALYSETYPEN,
  ANALYSETYPE_LABEL,
  ANALYSETYPE_OMSCHRIJVING,
  BEAM_LOAD_ROLES,
  BEAM_LOAD_ROLE_LABEL,
  CONCRETE_E_CM,
  CPE10_BRON,
  CPE10_MIN_OPPERVLAK_M2,
  CPE_PLAT_DAK,
  CPE_PLAT_DAK_BRON,
  CPI_BRON,
  CPI_ONBEKEND,
  CSCD_BRON,
  CSCD_GRENSHOOGTE_M,
  C_DIR,
  C_O,
  C_SEASON,
  DEFAULT_GRID,
  DEFAULT_STRUCTURAL_GRID,
  DEFAULT_VIEW,
  DoorsnedeOnbekendFout,
  E_STAAL,
  G,
  GEBRUIKSCATEGORIEEN,
  GEVOLGKLASSEN,
  K_CR_STANDAARD,
  K_FI,
  K_I,
  LABEL_ZUIVER_STAAL,
  LOAD_SOORT_MEERVOUD,
  MAX_VRIJE_GEVALLEN,
  MELDING_ZONE_I,
  MIN_SEGMENT_MM,
  OUDE_STANDAARDSET,
  PARTIELE_FACTOREN,
  PLAAT_RAND_NAAM_NL,
  PLATE_DEFAULTS,
  PROJECT_FILE_EXT,
  PROJECT_FORMAT_VERSION,
  PSI_BRON,
  PSI_GEBRUIK,
  PSI_SNEEUW,
  PSI_WIND,
  RHO_BETON,
  RHO_LUCHT,
  RHO_STAAL,
  SCHEEFSTAND_COMBO_OFFSET,
  SCHEEFSTAND_ID_OFFSET,
  SOORTEN_BUITEN_STAAL,
  SPIEGELREGELS_ELEMENTKRACHTEN,
  SPIEGELREGELS_STAAF,
  SPIEGELREGELS_TOETSCONFIG,
  SPRONGBAND_GRADEN,
  STANDAARD_BELASTINGGEVALLEN,
  STANDAARD_CATEGORIE,
  STANDAARD_GEVOLGKLASSE,
  STANDAARD_WIND_INSTELLINGEN,
  SUPPORTED_TIMBER_GRADES,
  TABEL_71_BRON,
  TERREIN_CATEGORIEEN,
  TIMBER_E_MEAN,
  TIMBER_RHO_MEAN,
  VERLOOP_SEGMENTEN,
  VERTICAAL_VANAF_GRADEN,
  WINDGEBIEDEN,
  WIND_COMBI_PREFIX,
  Z0_II,
  ZMAX_M,
  aantalAfbeeldingen,
  aantalGebruiksgevallen,
  aantalVerloopSegmenten,
  alphaCrLabel,
  alphaCrStaafNotitie,
  analyseToelichting,
  analysetypeUitBestand,
  basisSleutel,
  beamLengthMm,
  beddingSplitsFracties,
  beeldKernfoutAf,
  begeleidendeOpstellingen,
  beoordeelCombinatiesBijOpenen,
  bepaalAlphaCr,
  bepaalDoorbuigingsInvoer,
  bepaalPlaatRand,
  bepaalStandaardRol,
  bepaalVerloop,
  berekenE,
  berekenPlaatMeshSignatuur,
  berekenStuwdruk,
  blijvendeFactorAfwijkingen,
  bouwMultiInput,
  buildForcesEnvelope,
  buildMatrices,
  buildMesh,
  buildSteelCheckInputs,
  buildTimberCheckInputs,
  chordRelativeMaxMm,
  collinearContinuations,
  combinatiesVanSoort,
  combinationsFromFile,
  combinationsToFile,
  combineResults,
  commitPlaatMeshCache,
  computeEnvelope,
  controleerDoorsneden,
  controleerVelden,
  cpeWand,
  defaultCombinations,
  deflectionNotesFor,
  deserializeProject,
  dichtheidVanMateriaal,
  doorsnedeOpPositie,
  doorsnedeVeldenVoorSolver,
  doorsnedeVoorSolver,
  eigenGewichtLasten,
  eigenGewichtPerMeter,
  eigenGewichtVanDoorsnede,
  equivalentUdlFromMoments,
  extractFieldDeflectionMm,
  gelijkeCombinatie,
  gelijkeInhoud,
  genereerStandaardCombinaties,
  genereerWindCombinaties,
  genereerWindbelasting,
  getScheefstandRichtingen,
  getSecondOrderInput,
  getSecondOrderState,
  gevalResultaten,
  gevolgklasseBijOpenen,
  gradenTekst,
  handmatigeStuwdruk,
  handtekeningVanGeneratie,
  handtekeningVanModel,
  hellingGradenVanStaaf,
  herstelCombinaties,
  isAfgeleidVanStandaard,
  isAsgelijndeRechthoek,
  isOudeStandaardcombinatie,
  isOverwegendVerticaal,
  isSteelProfile,
  isWindgeneratorCombinatie,
  isZuivereStaalconstructie,
  kCrUitConfig,
  keurCheckConfig,
  klasseUitKenmerk,
  liftSpringK,
  mapDeflectionClass,
  mapLoadDuration,
  mapLtbLoadPosition,
  mapServiceClass,
  matchSupportedTimberGrade,
  matenOpPositie,
  meldingenBelastinggevallen,
  metScheefstandRichtingen,
  nonlinearVoorBestand,
  onbekendeDoorsneden,
  ontbrekendeStandaardcombinaties,
  openCombinatieStaat,
  parseRechthoek,
  parseTimberRectMm,
  plaatNaarSolverInput,
  plaatRandLabel,
  profileLookupKey,
  quasiPermanentDeflection,
  randlastNaarSolverInput,
  randpuntlastNaarSolverInput,
  redenZuiverStaal,
  referentieVanStaaf,
  registreerPlaatMeshCacheCommitter,
  resolveSection,
  resultaatInReferentierichting,
  richtingssprongNabij,
  richtingssprongNotities,
  rolVanStaaf,
  sanitizeRestraintFractions,
  scheefstandRichtingLabel,
  segmentenVoorVerloop,
  selecteerCombinaties,
  serializeProject,
  solve,
  solveAllCases,
  solveAllCasesNonlinear,
  solveCombinationSecondOrder,
  soortVanCombinatie,
  spiegelElementKrachten,
  spiegelFracties,
  spiegelZones,
  staafInReferentierichting,
  staafLengteMm,
  stabiliteitsMeldingen,
  startSidecar,
  synchroniseerStandaard,
  synchroniseerWindCombinaties,
  timberDeflectionNumerators,
  toetsdataInReferentierichting,
  valideerModel,
  valideerPlaatPolygoon,
  veranderlijkeBelastingenZonderLeiding,
  veranderlijkeFactorVerschillen,
  verenNaarCanoniek,
  verouderdeWindCombinaties,
  vervangDoorStandaard,
  vervangVerouderdeCombinaties,
  verwerkRegel,
  verwerkVerzoek,
  verwijderBelastinggeval,
  verwijderCombinatie,
  verwijderWeesFactoren,
  voegBelastinggevalToe,
  voegCombinatieToe,
  volgendVrijId,
  wijzigBelastinggeval,
  wijzigCombinatie,
  windCombinatiesVoor,
  withPlateDefaults,
  zeegNotities,
  zeegVoorToets,
  zetCombinatieResultaat,
  zetGevolgklasse,
  zetSolverLogOpvanger,
  zijdelingseVerplaatsingMm,
  zijdenInWereldtermen
};
