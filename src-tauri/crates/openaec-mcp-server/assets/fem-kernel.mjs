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
  /** Add a plate mesh node with ID starting from 1000 */
  addPlateNode(x, y) {
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
        let Ke;
        if (releasedLocalDofs.length > 0) {
          const L = calculateBeamLength(n1, n2);
          const angle = calculateBeamAngle(n1, n2);
          if (L < 1e-10) throw new Error("Beam element has zero length");
          const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
          applyEndReleases(Kl, releasedLocalDofs);
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
        let Ke;
        if (releasedLocalDofs.length > 0) {
          const L = calculateBeamLength(n1, n2);
          const angle = calculateBeamAngle(n1, n2);
          if (L < 1e-10) throw new Error("Beam element has zero length");
          const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
          applyEndReleases(Kl, releasedLocalDofs);
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
        console.warn(`Skipping element ${element.id} in mixed analysis: ${e}`);
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
      if (releasedLocalDofs.length > 0) {
        const material2 = mesh.getMaterial(beam.materialId);
        if (material2) {
          const Kl = calculateBeamLocalStiffness(L, material2.E, beam.section.A, beam.section.I);
          applyEndReleases(Kl, releasedLocalDofs, localForces);
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
    return { wAt: () => 0, uAt: () => 0 };
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
    uAt: (x) => (C1 * x - Rx1(x)) / EA
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
  const dLoc = localDisp.slice();
  if (releasedLocalDofs.length > 0) {
    const m = releasedLocalDofs.length;
    const A = [];
    const b = [];
    for (let r = 0; r < m; r++) {
      const i = releasedLocalDofs[r];
      let rhs = equivalentNodalForces[i];
      for (let j = 0; j < 6; j++) {
        if (!releasedLocalDofs.includes(j)) rhs -= Kl.get(i, j) * dLoc[j];
      }
      b.push(rhs);
      A.push(releasedLocalDofs.map((jj) => Kl.get(i, jj)));
    }
    const sol = solveKleinStelsel(A, b);
    if (sol) {
      for (let r = 0; r < m; r++) dLoc[releasedLocalDofs[r]] = sol[r];
    }
  }
  if (releasedLocalDofs.length > 0) {
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
    for (const p of particulars) {
      if (p.kind === "full" && EI > 0 && EA > 0) {
        const dl = p.dl;
        const dqy = dl.qyE - dl.qyS;
        const dqx = dl.qxE - dl.qxS;
        w += dl.qyS * x * x * (L - x) * (L - x) / (24 * EI);
        w += dqy * (Math.pow(x, 5) / (120 * L) - L * x * x * x / 40 + L * L * x * x / 60) / EI;
        u += dl.qxS * x * (L - x) / (2 * EA);
        u += dqx * x * (L * L - x * x) / (6 * L * EA);
      } else if (p.kind === "partial" && p.partial) {
        w += p.partial.wAt(x);
        u += p.partial.uAt(x);
      }
    }
    deflection.push(w);
    axialDisp.push(u);
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
function calculateCrackingMoment(b, h, fctm, Ecm, As, d, Es = 2e11) {
  const alphaE = Es / Ecm;
  const Ac = b * h;
  const AsTrans = alphaE * As;
  const x0 = (Ac * h / 2 + AsTrans * d) / (Ac + AsTrans);
  const Iunc = b * h * h * h / 12 + Ac * (h / 2 - x0) ** 2 + AsTrans * (d - x0) ** 2;
  const Mcr = fctm * Iunc / (h - x0);
  return { Mcr, Iunc, x0 };
}
function calculateCrackedI(b, d, As, Ecm, Es = 2e11, AsTop, dTop) {
  const alphaE = Es / Ecm;
  const AsTrans = alphaE * As;
  const AsTopTrans = AsTop ? alphaE * AsTop : 0;
  const d2 = dTop ?? 0.1 * d;
  const a = b / 2;
  const bCoef = AsTopTrans + AsTrans;
  const c = -(AsTrans * d + AsTopTrans * d2);
  const xCr = (-bCoef + Math.sqrt(bCoef * bCoef - 4 * a * c)) / (2 * a);
  const Icr = b * xCr * xCr * xCr / 3 + AsTrans * (d - xCr) ** 2 + AsTopTrans * (xCr - d2) ** 2;
  return { Icr, xCr };
}
function calculateEffectiveI(M, Mcr, Iunc, Icr, beta = 0.5) {
  if (Math.abs(M) <= Mcr) {
    return Iunc;
  }
  const zeta = 1 - beta * (Mcr / M) ** 2;
  const zetaClamped = Math.max(0, Math.min(1, zeta));
  const invIeff = zetaClamped / Icr + (1 - zetaClamped) / Iunc;
  const Ieff = 1 / invIeff;
  return Math.min(Ieff, Iunc);
}
function initCrackedSectionState(b, h, d, As, concrete, Es = 2e11) {
  const { Mcr, Iunc } = calculateCrackingMoment(b, h, concrete.fctm, concrete.Ecm, As, d, Es);
  const { Icr, xCr } = calculateCrackedI(b, d, As, concrete.Ecm, Es);
  return {
    isCracked: false,
    Mcr,
    Icr,
    Ieff: Iunc,
    xCr,
    curvature: 0,
    EIeff: concrete.Ecm * Iunc
  };
}
function updateCrackedSectionState(state, M, Iunc, Ecm, beta = 0.5) {
  const isCracked = Math.abs(M) > state.Mcr;
  const Ieff = calculateEffectiveI(M, state.Mcr, Iunc, state.Icr, beta);
  const EIeff = Ecm * Ieff;
  const curvature = EIeff > 0 ? M / EIeff : 0;
  return {
    ...state,
    isCracked,
    Ieff,
    EIeff,
    curvature
  };
}

// src/core/solver/NonlinearSolver.ts
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
    if (L < 1e-10) continue;
    const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }
    if (includeGeometric) {
      const N = -(axialForces.get(beam.id) || 0);
      const Kg = calculateGeometricStiffness(L, N);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          Kl.addAt(i, j, Kg.get(i, j));
        }
      }
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
function assembleGlobalStiffnessFNL(mesh, sectionStates, crackedStates, axialForces, includeGeometric, materialType) {
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
    if (L < 1e-10) continue;
    let EI_eff;
    if (materialType === "concrete") {
      const crackedState = crackedStates.get(beam.id);
      if (crackedState && crackedState.isCracked) {
        EI_eff = crackedState.EIeff;
      } else {
        EI_eff = material.E * beam.section.I;
      }
    } else {
      const sectionState = sectionStates.get(beam.id);
      EI_eff = sectionState?.tangentStiffness ?? material.E * beam.section.I;
    }
    const Kl = calculateBeamLocalStiffnessFNL(L, material.E, beam.section.A, beam.section.I, EI_eff);
    const releasedLocalDofs = getReleasedLocalDofs(beam);
    if (releasedLocalDofs.length > 0) {
      applyEndReleases(Kl, releasedLocalDofs);
    }
    if (includeGeometric) {
      const N = -(axialForces.get(beam.id) || 0);
      const Kg = calculateGeometricStiffness(L, N);
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          Kl.addAt(i, j, Kg.get(i, j));
        }
      }
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
function updateAllSectionStates(mesh, displacements, sectionStates, crackedStates, beamForces, opts) {
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
    if (opts.materialType === "concrete") {
      const forces = beamForces.get(beam.id);
      const M = forces ? Math.max(Math.abs(forces.M1), Math.abs(forces.M2), Math.abs(forces.maxM)) : 0;
      let crackedState = crackedStates.get(beam.id);
      if (crackedState) {
        const Iunc = beam.section.I;
        const Ecm = material.E;
        const beta = 0.5;
        crackedState = updateCrackedSectionState(crackedState, M, Iunc, Ecm, beta);
        crackedStates.set(beam.id, crackedState);
      }
    } else {
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
  }
  return { sectionStates, crackedStates };
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
    if (releasedLocalDofs.length > 0 && material) {
      const Kl = calculateBeamLocalStiffness(L, material.E, beam.section.A, beam.section.I);
      applyEndReleases(Kl, releasedLocalDofs, fLocal);
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
  const hasLoads = F.some((f) => f !== 0);
  if (!hasLoads) {
    throw new Error("No loads applied - add forces to nodes");
  }
  const numDofs = mesh.getNodeCount() * 3;
  let displacements = new Array(numDofs).fill(0);
  let axialForces = /* @__PURE__ */ new Map();
  let hasAxialConstraints = false;
  for (const beam of mesh.beamElements.values()) {
    const { start, end } = getConnectionTypes(beam);
    if (start === "tension_only" || start === "pressure_only" || end === "tension_only" || end === "pressure_only") {
      hasAxialConstraints = true;
      break;
    }
  }
  let sectionStates = /* @__PURE__ */ new Map();
  let crackedStates = /* @__PURE__ */ new Map();
  if (opts.materialNonlinear) {
    const steel = opts.materialType === "steel" ? createSteelMaterial(opts.steelFy) : void 0;
    const concrete = opts.materialType === "concrete" ? createConcreteMaterial(opts.concreteFck) : void 0;
    for (const beam of mesh.beamElements.values()) {
      const material = mesh.getMaterial(beam.materialId);
      if (!material) continue;
      if (opts.materialType === "concrete") {
        const h = beam.section.h || Math.sqrt(beam.section.I * 12 / 1);
        const b = h > 0 ? beam.section.A / h : 0.3;
        const d = h * 0.9;
        const As = beam.section.A * 5e-3;
        const concMat = concrete;
        const crackedState = initCrackedSectionState(b, h, d, As, concMat, 2e11);
        crackedStates.set(beam.id, crackedState);
      } else {
        const state = initSectionState(beam.section, opts.materialType, steel, concrete);
        sectionStates.set(beam.id, state);
      }
    }
  }
  if (!opts.geometricNonlinear && !opts.materialNonlinear) {
    if (hasAxialConstraints) {
      return solveWithAxialConstraints(mesh, F, opts);
    }
    const K2 = assembleGlobalStiffnessWithGeometric(mesh, axialForces, false);
    const { K: Kbc, F: Fbc } = applyBoundaryConditions(K2, F, mesh);
    displacements = solveLinearSystem(Kbc, Fbc);
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
          crackedStates,
          axialForces,
          opts.geometricNonlinear,
          opts.materialType
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
        deltaU = solveLinearSystem(Kbc, residual);
      } catch (e) {
        if (opts.geometricNonlinear) throw new Error(DIVERGENCE_MSG);
        throw e;
      }
      for (let i = 0; i < numDofs; i++) {
        displacements[i] += deltaU[i];
      }
      const forcesResult = calculateAllInternalForces(mesh, displacements);
      axialForces = forcesResult.axialForces;
      beamForces = forcesResult.beamForces;
      if (opts.materialNonlinear) {
        const statesResult = updateAllSectionStates(
          mesh,
          displacements,
          sectionStates,
          crackedStates,
          beamForces,
          opts
        );
        sectionStates = statesResult.sectionStates;
        crackedStates = statesResult.crackedStates;
      }
      const incrNorm = Math.sqrt(deltaU.reduce((s, d) => s + d * d, 0));
      const dispNorm = Math.sqrt(displacements.reduce((s, d) => s + d * d, 0));
      if (!Number.isFinite(incrNorm) || !Number.isFinite(dispNorm)) {
        if (opts.geometricNonlinear) throw new Error(DIVERGENCE_MSG);
        break;
      }
      if (incrNorm <= opts.tolerance * Math.max(dispNorm, 1e-30)) {
        converged = true;
        break;
      }
      if (iter >= 1 && incrNorm > prevIncrNorm) {
        growthCount++;
      } else {
        growthCount = 0;
      }
      if (growthCount >= 3 && opts.geometricNonlinear) {
        throw new Error(DIVERGENCE_MSG);
      }
      prevIncrNorm = incrNorm;
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
      crackedStates,
      axialForces,
      opts.geometricNonlinear,
      opts.materialType
    );
  } else {
    K = assembleGlobalStiffnessWithGeometric(mesh, axialForces, opts.geometricNonlinear);
  }
  if (opts.geometricNonlinear) {
    const { K: Kstab } = applyBoundaryConditions(K, F, mesh);
    if (countNonPositivePivots(Kstab) > 0) {
      throw new Error(
        "Second-order (P-Delta) analysis is unstable \u2014 the applied load is at or above the critical (buckling) load"
      );
    }
  }
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
  }
  let maxVonMises = 0;
  for (const forces of beamForces.values()) {
    maxVonMises = Math.max(maxVonMises, Math.abs(forces.maxM));
  }
  if (opts.materialNonlinear && opts.materialType === "concrete") {
    let crackedCount = 0;
    for (const state of crackedStates.values()) {
      if (state.isCracked) crackedCount++;
    }
    console.log(`[FNL Concrete] ${crackedCount}/${crackedStates.size} beams cracked`);
  }
  return {
    displacements,
    reactions,
    elementStresses: /* @__PURE__ */ new Map(),
    beamForces,
    maxVonMises,
    minVonMises: 0,
    // Include cracked section info in result for concrete FNL
    crackedSectionStates: opts.materialNonlinear && opts.materialType === "concrete" ? crackedStates : void 0
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
    displacements = solveLinearSystem(Kmod, Fmod);
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
function solveMixed(mesh, _opts) {
  const analysisType = "mixed_beam_plate";
  const dofsPerNode = 3;
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
  const Kmod = K.clone();
  const Fmod = [...F];
  const penalty = 1e20;
  for (const dof of constrainedDofs) {
    Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
    Fmod[dof] = 0;
  }
  const displacements = solveLinearSystem(Kmod, Fmod);
  const reactions = K.multiplyVector(displacements);
  for (let i = 0; i < reactions.length; i++) {
    reactions[i] = reactions[i] - F[i];
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
    const displacements2 = solveLinearSystem(Kbc2, Fbc2);
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
  const displacements = solveLinearSystem(Kbc, Fbc);
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
var meshCacheRegister = /* @__PURE__ */ new Map();
var polygoonRandlastRegister = [];
function registreerPlaatMeshCaches(perPlaat) {
  meshCacheRegister.clear();
  for (const [plateId, cache] of perPlaat) meshCacheRegister.set(plateId, cache);
}
function leesPlaatMeshCache(plateId) {
  return meshCacheRegister.get(plateId);
}
function registreerPolygoonRandlasten(lasten) {
  polygoonRandlastRegister = [...lasten];
}
function leesPolygoonRandlasten(plateId) {
  return polygoonRandlastRegister.filter((l) => l.plateId === plateId);
}
var meshCacheCommitter = null;
function registreerPlaatMeshCacheCommitter(fn) {
  meshCacheCommitter = fn;
}
function commitPlaatMeshCache(plateId, cache) {
  meshCacheCommitter?.(plateId, cache);
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
        plateRects.push({ p, minX, minZ, width, height, nx, ny });
        continue;
      }
      const vormFout = valideerPlaatPolygoon(punten, TOL_MM);
      if (vormFout) {
        throw new Error(`Plaat ${p.id}: ${vormFout}`);
      }
      const handtekening = berekenPlaatMeshSignatuur(punten, meshSize);
      const kandidaten = [p.meshCache, leesPlaatMeshCache(p.id)];
      const cache = kandidaten.find((c) => c && c.signature === handtekening);
      if (!cache) {
        throw new Error(
          `Plaat ${p.id} is geen asgelijnde rechthoek en rekent daarom als polygonplaat, maar het CDT-rekenmesh ontbreekt of is verouderd. Open het canvas (het mesh wordt daar automatisch gegenereerd) en reken daarna opnieuw.`
        );
      }
      const nPts = cache.points.length;
      const indexOk = cache.triangles.every((t) => t.length === 3 && t.every((i) => Number.isInteger(i) && i >= 0 && i < nPts)) && cache.edgeNodeIndices.every((rand) => rand.every((i) => Number.isInteger(i) && i >= 0 && i < nPts));
      if (!indexOk || nPts < 3 || cache.triangles.length < 1) {
        throw new Error(
          `Plaat ${p.id}: de meshcache is beschadigd. Wijzig de plaat (bijv. de meshSize) zodat het mesh opnieuw wordt gegenereerd.`
        );
      }
      plaatPolygonen.push({ p, cache });
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
    const updates = {};
    if (sTx || sTz || eTx || eTz) {
      updates.startConnections = {
        Tx: sTx ? "hinge" : "fixed",
        Tz: sTz ? "hinge" : "fixed",
        Rz: sRy ? "hinge" : "fixed"
      };
      updates.endConnections = {
        Tx: eTx ? "hinge" : "fixed",
        Tz: eTz ? "hinge" : "fixed",
        Rz: eRy ? "hinge" : "fixed"
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
  const beamKnoopPerFractie = /* @__PURE__ */ new Map();
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
    const ruweSplits = [
      ...plateRects.length > 0 ? berekenPlaatrandSplitsFracties(nA, nB, plateRects, TOL_MM) : [],
      ...puntlastFracties.get(b.id) ?? []
    ].sort((p, q) => p - q);
    const splitsT = [];
    for (const t of ruweSplits) {
      if (splitsT.length === 0 || Math.abs(t - splitsT[splitsT.length - 1]) > 1e-9) splitsT.push(t);
    }
    if (splitsT.length === 0) {
      const meshBeam = mesh.addBeamElement([fromId, toId], matId, section);
      if (!meshBeam) continue;
      beamIdMap.set(b.id, meshBeam.id);
      pasReleasesToe(meshBeam.id, b, true, true);
      beamKnoopPerFractie.set(b.id, [
        { t: 0, meshNodeId: fromId },
        { t: 1, meshNodeId: toId }
      ]);
    } else {
      const knoopIds = [fromId];
      for (const t of splitsT) {
        const mx = (nA.x + t * (nB.x - nA.x)) / 1e3;
        const my = (nA.z + t * (nB.z - nA.z)) / 1e3;
        const bestaand = mesh.findNodeAt(mx, my, 1e-3);
        knoopIds.push(bestaand ? bestaand.id : mesh.addNode(mx, my).id);
      }
      knoopIds.push(toId);
      const grens = [0, ...splitsT, 1];
      beamKnoopPerFractie.set(
        b.id,
        grens.map((t, i) => ({ t, meshNodeId: knoopIds[i] }))
      );
      const segs = [];
      for (let i = 0; i < knoopIds.length - 1; i++) {
        const mb = mesh.addBeamElement([knoopIds[i], knoopIds[i + 1]], matId, section);
        if (!mb) continue;
        pasReleasesToe(mb.id, b, i === 0, i === knoopIds.length - 2);
        segs.push({ meshId: mb.id, t0: grens[i], t1: grens[i + 1] });
      }
      if (segs.length > 0) {
        beamIdMap.set(b.id, segs[0].meshId);
        if (segs.length > 1) beamSegments.set(b.id, segs);
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
    for (const { p, minX, minZ, width, height, nx, ny } of plateRects) {
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
      plateInfo.push({ plateId: p.id, region });
      pasPlaatEigengewichtToe(p, region.elementIds);
    }
  }
  if (plaatPolygonen.length > 0) {
    for (const { p, cache } of plaatPolygonen) {
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
        // rand-index (edgeNodeIds hieronder); een benoemde-rand-last op een
        // polygonplaat vervalt daardoor stil in het randlastenblok.
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
      plateInfo.push({ plateId: p.id, region, edgeNodeIds });
      pasPlaatEigengewichtToe(p, elementIds);
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
  const edgeLds = input.edgeLoads;
  if (plateInfo.length > 0) {
    const infoByPlateId = new Map(plateInfo.map((pi) => [pi.plateId, pi]));
    const pasRandlastToe = (randNodeIds, p_kNm, dir, f) => {
      if (!randNodeIds || randNodeIds.length < 2) return;
      const p_Nm = p_kNm * 1e3 * f;
      const px = dir === "x" ? p_Nm : 0;
      const py = dir === "z" ? p_Nm : 0;
      const krachten = computeEdgeLoadNodalForces(mesh, randNodeIds, px, py);
      applyNodalForces(mesh, krachten.map((kr) => ({
        nodeId: kr.nodeId,
        fx: kr.fx + schFactor * -kr.fy,
        fy: kr.fy
      })));
    };
    const invoerIndexBewust = /* @__PURE__ */ new Set();
    if (edgeLds && edgeLds.length > 0) {
      for (const el of edgeLds) {
        if (el.edgeIndex !== void 0 && el.plateId !== void 0) {
          invoerIndexBewust.add(el.plateId);
        }
      }
      for (const el of edgeLds) {
        const f = loadFactor ? loadFactor(el.caseId) : 1;
        if (f === 0 || !el.p) continue;
        const info = infoByPlateId.get(el.plateId);
        if (!info) continue;
        const dir = el.dir ?? "z";
        if (el.edgeIndex !== void 0) {
          pasRandlastToe(info.edgeNodeIds?.[el.edgeIndex] ?? [], el.p, dir, f);
          continue;
        }
        const rand = info.region.edges?.[el.edge];
        if (!rand || rand.nodeIds.length < 2) continue;
        pasRandlastToe(rand.nodeIds, el.p, dir, f);
      }
    }
    const invoerCaseId = input.caseId;
    for (const pi of plateInfo) {
      if (!pi.edgeNodeIds) continue;
      if (invoerIndexBewust.has(pi.plateId)) continue;
      for (const rl of leesPolygoonRandlasten(pi.plateId)) {
        const f = loadFactor ? loadFactor(rl.caseId) : invoerCaseId !== void 0 && rl.caseId !== invoerCaseId ? 0 : 1;
        if (f === 0 || !rl.p) continue;
        pasRandlastToe(pi.edgeNodeIds[rl.edgeIndex] ?? [], rl.p, rl.dir, f);
      }
    }
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
  return { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments };
}
function convertResult(mesh, engineResult, nodeIdMap, beamIdMap, supports, plateInfo, nodeIndex, beamSegments) {
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
  for (const [uiId, meshId] of beamIdMap) {
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
        axialDisp
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
      axialDisp: (bf.axialDisp ?? []).map((u) => u * 1e3)
      // m → mm
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
function solve(input) {
  const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments } = buildMesh(input);
  const heeftPlaten = plateInfo.length > 0;
  const engineResult = solveNonlinear(mesh, {
    analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
    geometricNonlinear: false
  });
  const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : void 0;
  return convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments);
}
function solveAllCases(input) {
  const perCase = /* @__PURE__ */ new Map();
  for (const c of input.cases) {
    const { mesh, nodeIdMap, beamIdMap, plateInfo, beamSegments } = buildMesh(input, (caseId) => caseId === c.id ? 1 : 0);
    if (!meshHeeftLasten(mesh)) continue;
    const heeftPlaten = plateInfo.length > 0;
    const engineResult = solveNonlinear(mesh, {
      analysisType: heeftPlaten ? "mixed_beam_plate" : "frame",
      geometricNonlinear: false
    });
    const nodeIndex = heeftPlaten ? buildNodeIdToIndex(mesh, "mixed_beam_plate") : void 0;
    perCase.set(c.id, convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports, plateInfo, nodeIndex, beamSegments));
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
function solveCombinationSecondOrder(input, combo) {
  const { mesh, nodeIdMap, beamIdMap, plateInfo } = buildMesh(
    input,
    (caseId) => combo.factors.get(caseId ?? -1) ?? 0
  );
  if (plateInfo.length > 0) {
    throw new Error(
      `2e-orde-berekening met platen wordt nog niet ondersteund \u2014 schakel "2e orde (P-\u0394)" uit of verwijder de platen.`
    );
  }
  if (!meshHeeftLasten(mesh)) return null;
  try {
    const engineResult = solveNonlinear(mesh, {
      analysisType: "frame",
      geometricNonlinear: true,
      // Geïtereerde P-Δ convergeert met ratio ≈ P/P_kr per iteratie; 100
      // iteraties dekt tot P ≈ 0.87·P_kr bij tol 1e-6. Daarboven → nette fout.
      maxIterations: 100,
      tolerance: 1e-6
    });
    return convertResult(mesh, engineResult, nodeIdMap, beamIdMap, input.supports);
  } catch (e) {
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

// src/components/fem/solver/combinations.ts
var G = 1;
var Q = 2;
var S = 3;
var W = 4;
function defaultCombinations() {
  return [
    {
      id: 1,
      name: "ULS 6.10a",
      type: "uls",
      formula: "1.35G + 1.5\xB7\u03C8\u2080\xB7Q + 1.5\xB7\u03C8\u2080\xB7S + 1.5\xB7\u03C8\u2080\xB7W",
      factors: /* @__PURE__ */ new Map([[G, 1.35], [Q, 1.05], [S, 1.05], [W, 0.9]])
    },
    {
      id: 2,
      name: "ULS 6.10b (Q leidend)",
      type: "uls",
      formula: "1.2G + 1.5Q + 1.5\xB7\u03C8\u2080\xB7S + 1.5\xB7\u03C8\u2080\xB7W",
      factors: /* @__PURE__ */ new Map([[G, 1.2], [Q, 1.5], [S, 1.05], [W, 0.9]])
    },
    {
      id: 3,
      name: "ULS 6.10b (S leidend)",
      type: "uls",
      formula: "1.2G + 1.5S + 1.5\xB7\u03C8\u2080\xB7Q + 1.5\xB7\u03C8\u2080\xB7W",
      factors: /* @__PURE__ */ new Map([[G, 1.2], [S, 1.5], [Q, 1.05], [W, 0.9]])
    },
    {
      id: 4,
      name: "ULS 6.10b (W leidend)",
      type: "uls",
      formula: "1.2G + 1.5W + 1.5\xB7\u03C8\u2080\xB7Q + 1.5\xB7\u03C8\u2080\xB7S",
      factors: /* @__PURE__ */ new Map([[G, 1.2], [W, 1.5], [Q, 1.05], [S, 1.05]])
    },
    {
      id: 5,
      name: "ULS uplift",
      type: "uls",
      formula: "0.9G + 1.5W",
      factors: /* @__PURE__ */ new Map([[G, 0.9], [W, 1.5]])
    },
    {
      id: 6,
      name: "SLS Karakteristiek",
      type: "sls",
      formula: "G + Q + \u03C8\u2080\xB7S + \u03C8\u2080\xB7W",
      factors: /* @__PURE__ */ new Map([[G, 1], [Q, 1], [S, 0.7], [W, 0.6]])
    },
    {
      id: 7,
      name: "SLS Frequent",
      type: "sls",
      formula: "G + \u03C8\u2081\xB7Q + \u03C8\u2082\xB7S",
      factors: /* @__PURE__ */ new Map([[G, 1], [Q, 0.5], [S, 0.2]])
    },
    {
      id: 8,
      name: "SLS Quasi-permanent",
      type: "sls",
      formula: "G + \u03C8\u2082\xB7Q",
      factors: /* @__PURE__ */ new Map([[G, 1], [Q, 0.3]])
    }
  ];
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
  const nodeIds = /* @__PURE__ */ new Set();
  const beamIds = /* @__PURE__ */ new Set();
  const reactionIds = /* @__PURE__ */ new Set();
  for (const [caseId] of combo.factors) {
    const r = perCase.get(caseId);
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
      const r = perCase.get(caseId);
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
      const r = perCase.get(caseId);
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
    for (const [caseId, factor] of combo.factors) {
      const r = perCase.get(caseId);
      if (!r) continue;
      const ef = r.elements.get(bid);
      if (!ef) continue;
      N += factor * ef.N;
      V += factor * ef.V;
      Ms += factor * ef.M_start;
      Me += factor * ef.M_end;
      if (stations_mm.length === 0 && ef.stations_mm.length > 0) {
        L_mm = ef.L_mm;
        stations_mm = ef.stations_mm.slice();
        normalForce = new Array(ef.stations_mm.length).fill(0);
        shearForce = new Array(ef.stations_mm.length).fill(0);
        bendingMoment = new Array(ef.stations_mm.length).fill(0);
        deflection = new Array(ef.stations_mm.length).fill(0);
        axialDisp = new Array(ef.stations_mm.length).fill(0);
      }
      for (let i = 0; i < ef.stations_mm.length && i < normalForce.length; i++) {
        normalForce[i] += factor * (ef.normalForce[i] ?? 0);
        shearForce[i] += factor * (ef.shearForce[i] ?? 0);
        bendingMoment[i] += factor * (ef.bendingMoment[i] ?? 0);
        deflection[i] += factor * (ef.deflection?.[i] ?? 0);
        axialDisp[i] += factor * (ef.axialDisp?.[i] ?? 0);
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
      axialDisp
    });
  }
  const plateIds = /* @__PURE__ */ new Set();
  for (const [caseId] of combo.factors) {
    perCase.get(caseId)?.plateElements?.forEach((p) => plateIds.add(p.plateId));
  }
  let plateElements;
  if (plateIds.size > 0) {
    plateElements = [];
    for (const pid of plateIds) {
      let referentie;
      for (const [caseId] of combo.factors) {
        referentie = perCase.get(caseId)?.plateElements?.find((p) => p.plateId === pid);
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
        const bron = perCase.get(caseId)?.plateElements?.find((p) => p.plateId === pid);
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
function computeEnvelope(combinations, perCase) {
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
      const mAbs = Math.max(Math.abs(ef.M_start), Math.abs(ef.M_end));
      const prev = elements.get(beamId);
      if (!prev) {
        elements.set(beamId, {
          N_min: ef.N,
          N_max: ef.N,
          V_min: ef.V,
          V_max: ef.V,
          M_min: Math.min(ef.M_start, ef.M_end),
          M_max: Math.max(ef.M_start, ef.M_end),
          governingCombinationId: combo.id,
          governingMAbs: mAbs
        });
      } else {
        prev.N_min = Math.min(prev.N_min, ef.N);
        prev.N_max = Math.max(prev.N_max, ef.N);
        prev.V_min = Math.min(prev.V_min, ef.V);
        prev.V_max = Math.max(prev.V_max, ef.V);
        prev.M_min = Math.min(prev.M_min, ef.M_start, ef.M_end);
        prev.M_max = Math.max(prev.M_max, ef.M_start, ef.M_end);
        if (mAbs > prev.governingMAbs) {
          prev.governingCombinationId = combo.id;
          prev.governingMAbs = mAbs;
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

// src/lib/steelCheckBuilder.ts
function mapDeflectionClass(cls) {
  switch (cls) {
    case "roof":
      return "Roof";
    case "cantilever":
      return "Cantilever";
    case "custom":
      return "Custom";
    case "floor":
    default:
      return "Floor";
  }
}
function sanitizeRestraintFractions(fractions) {
  if (!Array.isArray(fractions)) return [];
  return [...new Set(fractions.filter((f) => Number.isFinite(f) && f > 0 && f < 1))].sort((a, b) => a - b);
}
var STEEL_PROFILE_PREFIXES = [
  "HEA",
  "HEB",
  "HEM",
  "IPE",
  "UPE",
  "UNP",
  "RHS",
  "SHS",
  "HFRHS",
  "KKR",
  "CHS"
];
var STEEL_GRADES = ["S235", "S275", "S355", "S420", "S460"];
function isSteelProfile(profileName) {
  if (!profileName) return false;
  const upper = profileName.toUpperCase();
  return STEEL_PROFILE_PREFIXES.some((p) => upper.startsWith(p));
}
function profileLookupKey(name) {
  return name.replace(/[\s\-.]/g, "").toUpperCase();
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
      `[doorbuigingstoets] staaf ${beam.id}: geen station-zakkingen in het solverresultaat (ouder resultaat?) \u2014 val terug op knoopverplaatsingen; de veldzakking kan hierdoor onderschat zijn. Reken het model opnieuw door.`
    );
    return nodalDeflectionMm(beam, result);
  }
  let w = 0;
  for (const v of stations) {
    if (Number.isFinite(v) && Math.abs(v) > Math.abs(w)) w = v;
  }
  return w;
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
  return Math.max(0, qKnPerM);
}
function buildSteelCheckInputs(data) {
  const inputs = [];
  const skipped = [];
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  const slsChar = slsCombos.find((c) => /karakter/i.test(c.name)) ?? slsCombos[0] ?? null;
  const slsResult = slsChar ? data.combinationResults.get(slsChar.id) ?? null : null;
  for (const beam of data.beams) {
    const profileName = beam.profile ?? "HEA160";
    if (!isSteelProfile(profileName)) continue;
    const profile = data.profileDb.get(profileLookupKey(profileName));
    if (!profile) {
      skipped.push({
        beamId: beam.id,
        reason: `profiel "${profileName}" is niet bekend in de EN 1993-profieldatabase`
      });
      continue;
    }
    const grade = beam.material ?? "S235";
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
    const cfg = beam.checkConfig ?? {};
    inputs.push({
      beam_id: beam.id,
      profile_name: profileName,
      steel_grade: grade.toUpperCase(),
      length_m: lengthMm / 1e3,
      forces_envelope: forcesEnvelope,
      lateral_bracing: {
        top_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraints),
        bottom_flange_positions: sanitizeRestraintFractions(cfg.lateralRestraintsBottom)
      },
      buckling_length_y_m: cfg.bucklingLengthY_m ?? lengthMm / 1e3,
      buckling_length_z_m: cfg.bucklingLengthZ_m ?? lengthMm / 1e3,
      deflection_limit_class: mapDeflectionClass(cfg.deflectionClass),
      // De Rust-kern gebruikt de noemer alleen bij klasse "Custom"
      // (deflection.rs::default_numerator); anders geldt de klassenoemer.
      deflection_limit_numerator: cfg.deflectionClass === "custom" ? cfg.deflectionLimitNumerator ?? 333 : 333,
      // Veldmaximum over de 21 stations, mm met teken (negatief = omlaag).
      deflection_actual_max_mm: extractFieldDeflectionMm(beam, slsResult),
      is_cantilever: cfg.deflectionClass === "cantilever",
      consequence_class: "CC1",
      pre_camber_mm: cfg.preCamber_mm ?? 0,
      // Blijvend BGT-deel is (nog) niet apart op te lossen → 0 betekent
      // w_add = w_fin, de zwaarste van de twee toetsen (veilig-zijdig).
      deflection_permanent_mm: 0,
      q_equiv_n_per_mm: equivalentUdlFromMoments(govPoints, lengthMm),
      // Last op de bovenflens aangenomen: destabiliserend, dus conservatief.
      z_a_mm: profile.geometry.h / 2
    });
  }
  return { inputs, skipped };
}

// src/lib/steelSections.generated.ts
var STEEL_SECTIONS = {
  "HEB160": { A: 5427.5, Iy: 24929151 },
  "HEB300": { A: 14909.9, Iy: 251688299 },
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
  "HEB180": { A: 6530, Iy: 383e5 },
  "HEB200": { A: 7809.999999999999, Iy: 57e6 },
  "HEB220": { A: 9100, Iy: 809e5 },
  "HEB240": { A: 10600, Iy: 1126e5 },
  "HEB260": { A: 11800, Iy: 1492e5 },
  "HEB280": { A: 13100, Iy: 1927e5 },
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
  "CHS508X20": { A: 30661.9, Iy: 914278e3 }
};

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
function timberDeflectionNumerators(cls, customN) {
  switch (cls) {
    case "roof":
      return { fin: 250, add: 250 };
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
function buildTimberCheckInputs(data) {
  const inputs = [];
  const skipped = [];
  const grades = data.supportedGrades && data.supportedGrades.length > 0 ? data.supportedGrades : SUPPORTED_TIMBER_GRADES;
  const ulsCombos = data.combinations.filter((c) => c.type === "uls");
  const slsCombos = data.combinations.filter((c) => c.type === "sls");
  const slsChar = slsCombos.find((c) => /karakter/i.test(c.name)) ?? slsCombos[0] ?? null;
  const slsResult = slsChar ? data.combinationResults.get(slsChar.id) ?? null : null;
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
        reason: `doorsnede "${beam.profile ?? "\u2014"}" is geen herkenbare rechthoek b\xD7h \u2014 gebruik bijv. "60x100" of "96x450 GL" als profielnaam`
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
    const wInstMm = extractFieldDeflectionMm(beam, slsResult);
    const cfg = beam.checkConfig ?? {};
    const defl = timberDeflectionNumerators(cfg.deflectionClass, cfg.deflectionLimitNumerator);
    inputs.push({
      beam_id: beam.id,
      width_mm: rect.bMm,
      height_mm: rect.hMm,
      strength_class: grade,
      service_class: mapServiceClass(cfg.serviceClass),
      load_duration: mapLoadDuration(cfg.loadDuration),
      length_m: lengthMm / 1e3,
      forces_envelope: forcesEnvelope,
      buckling_length_y_m: lengthMm / 1e3,
      buckling_length_z_m: lengthMm / 1e3,
      ltb_segment_length_m: 0,
      // 0 → staaflengte
      ltb_load_case: "UniformLoad",
      ltb_load_position: "CentreOfGravity",
      ltb_effective_length_override_m: 0,
      perform_ltb_check: true,
      k_cr: 1,
      load_sharing: false,
      deflection_inst_mm: wInstMm,
      // Volledige last als quasi-blijvend: maximale kruiptoeslag (veilig-zijdig).
      deflection_quasi_perm_mm: wInstMm,
      // Blijvend deel onbekend → 0, dus w_add = w_fin (veilig-zijdig).
      deflection_permanent_mm: 0,
      deflection_limit_fin: defl.fin,
      deflection_limit_add: defl.add
    });
  }
  return { inputs, skipped };
}

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
var RHO_STAAL = 7850;
var G2 = 9.81;
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
function resolveSection(material, profile) {
  const mat = material ?? "S235";
  const isHout = SUPPORTED_TIMBER_GRADES.includes(mat) || mat in TIMBER_E_MEAN;
  if (isHout) {
    const rect = parseRechthoek(profile);
    if (rect) {
      const { b, h } = rect;
      return {
        E: TIMBER_E_MEAN[mat] ?? 11e3,
        A: b * h,
        I: b * h * h * h / 12,
        bron: "hout-bxh"
      };
    }
  } else {
    const sec = STEEL_SECTIONS[normaliseer(profile ?? "")];
    if (sec) return { E: E_STAAL, A: sec.A, I: sec.Iy, bron: "staal-db" };
  }
  console.warn(
    `[solver] Doorsnede onbekend voor materiaal "${material}" + profiel "${profile}" \u2014 reken met default HEA 160 / S235. Controleer de staafeigenschappen.`
  );
  return { E: E_STAAL, A: 3877, I: 1673e4, bron: "default" };
}
function eigenGewichtPerMeter(material, profile) {
  const { A } = resolveSection(material, profile);
  const mat = material ?? "S235";
  const rho = TIMBER_RHO_MEAN[mat] ?? RHO_STAAL;
  return -(rho * (A * 1e-6) * G2) / 1e3;
}

// src/lib/thermalAlpha.ts
var ALPHA_STAAL = 12e-6;
var ALPHA_HOUT = 5e-6;
function thermalAlphaForMaterial(material) {
  return material !== void 0 && material in TIMBER_E_MEAN ? ALPHA_HOUT : ALPHA_STAAL;
}

// src/lib/modelNaarSolverInput.ts
function liftSpringK(s) {
  if (s.k === void 0) return void 0;
  if (s.type === "zSpring" || s.type === "xSpring") return s.k * 1e3;
  if (s.type === "rotSpring") return s.k * 1e6;
  return void 0;
}
function bouwMultiInput(model) {
  const multiInput = {
    nodes: model.nodes.map((n) => ({ id: n.id, x: n.x, z: n.z })),
    beams: model.beams.map((b) => {
      const sec = resolveSection(b.material, b.profile);
      return {
        id: b.id,
        from: b.from,
        to: b.to,
        E: sec.E,
        A: sec.A,
        I: sec.I,
        // Releases naar de engine: buigscharnieren via het legacy paar,
        // en het volledige object (mét Tx/Tz-hulzen in lokale assen)
        // ernaast — de engine kiest zelf het rijkere per-DOF-model zodra
        // er een translatie-release in zit.
        startConnection: b.releases?.startRy ? "hinge" : "fixed",
        endConnection: b.releases?.endRy ? "hinge" : "fixed",
        releases: b.releases
      };
    }),
    supports: model.supports.map((s) => ({ nodeId: s.nodeId, type: s.type, k: liftSpringK(s) })),
    // Platen (wandschijven, P2.3): rekenvelden met defaults aangevuld —
    // de engine meshet en schakelt zelf naar mixed_beam_plate.
    plates: model.plates.map((p) => {
      const d = withPlateDefaults(p);
      return {
        id: d.id,
        nodeIds: d.nodeIds,
        thickness: d.thickness,
        E: d.E,
        nu: d.nu,
        rho: d.rho,
        meshSize: d.meshSize
      };
    }),
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
    const deadCase = model.loadCases.find((c) => c.type === "dead") ?? model.loadCases[0];
    if (deadCase) {
      for (const b of model.beams) {
        const q = eigenGewichtPerMeter(b.material, b.profile);
        if (Math.abs(q) > 1e-9) {
          multiInput.loads.push({
            beamId: b.id,
            q,
            caseId: deadCase.id
          });
        }
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
    } else if (l.type === "edgeLoad" && l.plateId !== void 0 && l.q !== void 0) {
      multiInput.edgeLoads.push({
        plateId: l.plateId,
        edge: l.edge ?? "top",
        p: l.q,
        dir: l.qDir,
        caseId: l.caseId
      });
    }
  }
  return multiInput;
}

// src/io/projectFile.ts
var PROJECT_FILE_EXT = "ifcfem2d";
var PROJECT_FORMAT_VERSION = 2;
function combinationsToFile(combos) {
  return combos.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    formula: c.formula,
    factors: Object.fromEntries([...c.factors].map(([caseId, f]) => [String(caseId), f]))
  }));
}
function combinationsFromFile(raw) {
  if (!Array.isArray(raw)) return void 0;
  return raw.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type === "sls" ? "sls" : "uls",
    formula: c.formula ?? "",
    factors: new Map(
      Object.entries(c.factors ?? {}).map(([caseId, f]) => [Number(caseId), Number(f)])
    )
  }));
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
var version = "0.1.0";

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
    return {
      model: {
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
      },
      beams: bestand.beams ?? [],
      combinatiesUitBestand: combinationsFromFile(bestand.combinations) ?? null,
      nonlinearUitBestand: bestand.nonlinearEnabled ?? null,
      formatVersion: bestand.version
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
  return {
    model: {
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
    },
    beams,
    combinatiesUitBestand: null,
    nonlinearUitBestand: null,
    formatVersion: null
  };
}
function leesCombinaties(payload, uitBestand) {
  if (payload.combinations !== void 0) {
    const rauw = eisArray(payload.combinations, "combinations");
    const uit = combinationsFromFile(
      rauw
    );
    if (!uit) throw new InvoerFout("Veld `combinations` is geen geldige lijst.");
    return uit;
  }
  return uitBestand ?? defaultCombinations();
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
function pasCheckConfigToe(beams, payload) {
  if (payload.check_config === void 0) return beams;
  const configs = eisObject(payload.check_config, "check_config");
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
    u_x: ef.axialDisp
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
      governingMAbs: naarKNm(e.governingMAbs)
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
  const combinaties = leesCombinaties(payload, gelezen.combinatiesUitBestand);
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
  const gevraagd = gelezen.model.loadCases.map((lc) => lc.id);
  const opgelost = [...perCase.keys()];
  const legeGevallen = gevraagd.filter((id) => !perCase.has(id));
  const teToetsen = pasCheckConfigToe(gelezen.beams, payload);
  const beamIds = payload.beam_ids === void 0 ? null : new Set(
    eisArray(payload.beam_ids, "beam_ids").map(Number)
  );
  const staafSelectie = beamIds === null ? teToetsen : teToetsen.filter((b) => beamIds.has(b.id));
  const staal = buildSteelCheckInputs({
    nodes: gelezen.model.nodes,
    beams: staafSelectie,
    combinations: combinaties,
    combinationResults,
    profileDb
  });
  const waarschuwingen = [];
  if (profileDb.size === 0) {
    waarschuwingen.push(
      "Geen profieldatabase meegegeven (`profiles`); `steel_check_inputs` blijft daardoor leeg. Lever de lijst uit de staalprofielendatabase mee."
    );
  }
  if (legeGevallen.length > 0) {
    waarschuwingen.push(
      `Belastinggeval(len) ${legeGevallen.join(", ")} zonder werkzame last overgeslagen; ze tellen als nulbijdrage in de combinaties.`
    );
  }
  return {
    combinaties,
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
    waarschuwingen,
    formatVersion: gelezen.formatVersion
  };
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
    per_case: mapNaarObject(d.perCase, (r) => vormResultaat(r, d.metStations)),
    combinations: mapNaarObject(
      d.combinationResults,
      (r) => vormResultaat(r, d.metStations)
    ),
    envelope: vormEnvelop(d.envelope),
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
      nonlinear_used: d.nonlinear,
      solve_ms: d.solveMs
    },
    units: EENHEDEN,
    steel_check_inputs: d.staal.inputs,
    skipped_beams: d.staal.skipped.map((s) => ({
      beam_id: s.beamId,
      reason: s.reason
    })),
    warnings: d.waarschuwingen
  };
}
function opLoadProject(payload) {
  const gelezen = leesModel({
    project: { inhoud: leesTekst(payload, "inhoud") }
  });
  const m = gelezen.model;
  return {
    path: typeof payload.path === "string" ? payload.path : null,
    format_version: gelezen.formatVersion,
    supported_format_version: PROJECT_FORMAT_VERSION,
    model: m,
    combinations: (gelezen.combinatiesUitBestand ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      formula: c.formula,
      factors: Object.fromEntries([...c.factors].map(([k, v]) => [String(k), v]))
    })),
    nonlinear_enabled: gelezen.nonlinearUitBestand,
    counts: {
      nodes: m.nodes.length,
      beams: m.beams.length,
      supports: m.supports.length,
      plates: m.plates.length,
      loads: m.loads.length,
      load_cases: m.loadCases.length,
      combinations: (gelezen.combinatiesUitBestand ?? []).length
    }
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
        return maakFout(
          verzoek.id,
          "INTERN",
          "Modelvalidatie is in deze bouw nog niet beschikbaar. Gebruik `solve`: die weigert een onoplosbaar model met een eigen melding."
        );
    }
  } catch (err) {
    if (err instanceof InvoerFout) {
      return maakFout(verzoek.id, "INVOER_ONGELDIG", err.message, err.detail);
    }
    if (err instanceof BestandFout) {
      return maakFout(verzoek.id, "BESTAND_ONLEESBAAR", err.message, err.detail);
    }
    if (err instanceof ModelFout) {
      return maakFout(
        verzoek.id,
        "MODEL_ONOPLOSBAAR",
        "De solver kon dit model niet oplossen.",
        { originele_melding: err.message }
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
function nl(v, dec) {
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
      { symbool: "windgebied", waarde: `${gebied} \u2014 v_b,0 = ${nl(g.vb0, 1)} m/s`, bron: g.bron },
      { symbool: "terreincategorie", waarde: `${terrein} \u2014 z\u2080 = ${nl(t.z0, 3)} m, z_min = ${nl(t.zmin, 0)} m`, bron: t.bron },
      { symbool: "v_b", waarde: `${nl(C_DIR, 1)} \xB7 ${nl(C_SEASON, 1)} \xB7 ${nl(g.vb0, 1)} = ${nl(vb, 2)} m/s`, bron: "EN 1991-1-4 (4.1)" },
      { symbool: "z_e", waarde: `${nl(ze_m, 2)} m${zGebruikt !== ze_m ? ` \u2192 gerekend met z_min = ${nl(zGebruikt, 2)} m` : ""}`, bron: "EN 1991-1-4 \xA77.2.2 fig. 7.4" },
      { symbool: "k_r", waarde: `0,19 \xB7 (${nl(t.z0, 3)}/${nl(Z0_II, 3)})^0,07 = ${nl(kr, 4)}`, bron: "EN 1991-1-4 (4.5)" },
      { symbool: "c_r(z_e)", waarde: `${nl(kr, 4)} \xB7 ln(${nl(zGebruikt, 2)}/${nl(t.z0, 3)}) = ${nl(cr, 4)}`, bron: "EN 1991-1-4 (4.4)" },
      { symbool: "c_o(z_e)", waarde: `${nl(C_O, 2)} (vlak terrein, orografie buiten beschouwing)`, bron: "EN 1991-1-4 \xA74.3.3" },
      { symbool: "v_m(z_e)", waarde: `${nl(cr, 4)} \xB7 ${nl(C_O, 2)} \xB7 ${nl(vb, 2)} = ${nl(vm, 3)} m/s`, bron: "EN 1991-1-4 (4.3)" },
      { symbool: "I_v(z_e)", waarde: `${nl(K_I, 1)} / (${nl(C_O, 2)} \xB7 ln(${nl(zGebruikt, 2)}/${nl(t.z0, 3)})) = ${nl(iv, 4)}`, bron: "EN 1991-1-4 (4.7)" },
      { symbool: "\u03C1", waarde: `${nl(RHO_LUCHT, 2)} kg/m\xB3`, bron: "EN 1991-1-4 \xA74.5(1) opm. 2" },
      { symbool: "q_p(z_e)", waarde: `[1 + 7\xB7${nl(iv, 4)}] \xB7 \xBD \xB7 ${nl(RHO_LUCHT, 2)} \xB7 ${nl(vm, 3)}\xB2 = ${nl(qp_Nm2 / 1e3, 4)} kN/m\xB2`, bron: "EN 1991-1-4 (4.8)" }
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
        waarde: `${nl(qp_kNm2, 4)} kN/m\xB2 \u2014 handmatig ingevoerd op z_e = ${nl(ze_m, 2)} m`,
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
  combinatiesGenereren: true
};
var nl2 = (v, d) => v.toFixed(d).replace(".", ",");
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
var PSI0 = { wind: 0.6, veranderlijk: 0.7, sneeuw: 0.5 };
var PSI0_BRON = "NEN-EN 1990 tabel A1.1";
var GAMMA_BRON = "NEN-EN 1990 tabel A1.2(B) (6.10a/6.10b) en tabel A1.2(A) (EQU)";
var WIND_COMBI_PREFIX = "Wind-gen \xB7 ";
function genereerWindbelasting(model, inst) {
  const meldingen = [];
  const fout = (tekst) => {
    meldingen.push({ niveau: "fout", tekst });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null };
  };
  if (model.nodes.length < 2 || model.beams.length === 0) {
    return fout("Er is nog geen constructie om wind op te zetten.");
  }
  const geos = model.beams.map((b) => staafGeo(b, model.nodes)).filter((g) => g !== null).sort((a, b) => a.beam.id - b.beam.id);
  const zs = model.nodes.map((n) => n.z);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const h_m = (maxZ - minZ) / 1e3;
  if (h_m <= 0) return fout("De constructie heeft geen hoogte \u2014 wind is niet te bepalen.");
  const gevelL = geos.filter((g) => g.rol === "gevelLinks");
  const gevelR = geos.filter((g) => g.rol === "gevelRechts");
  const xsAlles = model.nodes.map((n) => n.x);
  const xLinks = gevelL.length > 0 ? Math.min(...gevelL.flatMap((g) => [g.x1, g.x2])) : Math.min(...xsAlles);
  const xRechts = gevelR.length > 0 ? Math.max(...gevelR.flatMap((g) => [g.x1, g.x2])) : Math.max(...xsAlles);
  const d_m = (xRechts - xLinks) / 1e3;
  if (d_m <= 0) return fout("De constructie heeft geen breedte \u2014 wind is niet te bepalen.");
  if (gevelL.length === 0 && gevelR.length === 0) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "Geen enkele staaf heeft het belastingtype linker- of rechtergevel. Controleer de belastingtypen in de staafeigenschappen \u2014 zonder gevelvlak krijgt het spant geen horizontale windbelasting."
    });
  }
  if (!(inst.hohSpant_m > 0)) return fout("Vul een h.o.h.-afstand van de spanten in (> 0 m).");
  if (!(inst.gebouwlengte_m > 0)) return fout("Vul de gebouwlengte haaks op het spant in (> 0 m).");
  if (!inst.richtingLinks && !inst.richtingRechts && !inst.richtingHaaks) {
    return fout("Kies minstens \xE9\xE9n windrichting.");
  }
  const breedte_m = inst.belastingbreedteOverride_m !== null && inst.belastingbreedteOverride_m > 0 ? inst.belastingbreedteOverride_m : inst.positieSpant === "kopgevelspant" ? inst.hohSpant_m / 2 : inst.hohSpant_m;
  const heeftHellendDak = geos.some((g) => g.rol === "dakHellend");
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
      tekst: `De stuwdruk is handmatig opgegeven (${nl2(stuwdruk.qp_kNm2, 3)} kN/m\xB2); de generator heeft hem niet zelf afgeleid.`
    });
  } else {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De stuwdruk is berekend met de ruwheidslengtes uit EN 1991-1-4 tabel 4.1. De Nederlandse nationale bijlage geeft de extreme stuwdruk ook rechtstreeks in tabelvorm per windgebied, terreinsoort en hoogte; die waarde kan afwijken. Houdt u die tabel aan, kies dan \u201Cstuwdruk handmatig\u201D en voer de waarde uit de nationale bijlage in."
    });
  }
  meldingen.push({
    niveau: "info",
    tekst: `Referentiehoogte z_e = ${nl2(ze_m, 2)} m (bouwhoogte) voor ALLE vlakken. Volgens NEN-EN 1991-1-4 \xA77.2.2 (figuur 7.4) mag dat wanneer h \u2264 b; bij een hoger gebouw is \xE9\xE9n strook op z_e = h de veilige kant, want de stuwdruk is daar het grootst.`
  });
  if (ze_m > ZMAX_M) {
    meldingen.push({
      niveau: "fout",
      tekst: `De bouwhoogte (${nl2(ze_m, 1)} m) ligt boven z_max = ${ZMAX_M} m; de snelheidsprofielformules van \xA74.3.2 gelden daar niet meer.`
    });
    return { ok: false, meldingen, gevallen: [], lasten: [], combinaties: [], samenvatting: null };
  }
  if (h_m >= CSCD_GRENSHOOGTE_M) {
    meldingen.push({
      niveau: "waarschuwing",
      tekst: `De bouwhoogte is ${nl2(h_m, 1)} m. De generator rekent met c_s\xB7c_d = 1,0; dat mag zonder meer alleen onder ${CSCD_GRENSHOOGTE_M} m (${CSCD_BRON}). Bepaal c_s\xB7c_d volgens \xA76.3 en verhoog de lasten zo nodig zelf.`
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
      tekst: `Inwendige druk handmatig op c_pi = ${nl2(inst.cpiHandmatig, 2)}. Dat is alleen juist wanneer de openingsverhouding \u03BC van het gebouw bekend is (\xA77.2.9); anders is \u201Cbeide (+0,2 en \u22120,3)\u201D de norm-conforme keuze.`
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
  for (const richting of richtingen) {
    for (const cpi of cpiWaarden) {
      const sleutel = `wind:${richting}:cpi${cpi >= 0 ? "+" : ""}${cpi.toFixed(2)}`;
      const naam = `Wind ${RICHTING_LABEL[richting].replace("wind ", "")} (c_pi = ${nl2(cpi, 2)})`;
      gevallen.push({ sleutel, naam, richting, cpi });
      const regels = [];
      for (const g of geos) {
        const opp_m2 = breedte_m * (g.L_mm / 1e3);
        if (opp_m2 < CPE10_MIN_OPPERVLAK_M2 && g.rol !== "vloer" && g.rol !== "binnen") {
          kleinOppervlak = true;
        }
        const push = (zone, cpe, bron, nx, nz, cpiHier, startFrac, endFrac) => {
          const w = stuwdruk.qp_kNm2 * (cpe - cpiHier);
          const q = drukNaarLokaleLijnlast(w, breedte_m, g, nx, nz);
          const deel = startFrac !== void 0 ? ` (${nl2(startFrac, 2)}\u2013${nl2(endFrac ?? 1, 2)} van de staaf)` : "";
          regels.push({
            beamId: g.beam.id,
            rol: g.rol,
            zone: zone + deel,
            cpe,
            cpi: cpiHier,
            w_kNm2: w,
            q_kNm: q,
            bron
          });
          if (Math.abs(q) < 1e-12) return;
          lasten.push({
            gevalSleutel: sleutel,
            beamId: g.beam.id,
            q,
            ...startFrac !== void 0 ? { startFrac, endFrac } : {},
            toelichting: `Staaf ${g.beam.id}, zone ${zone}${deel}: c_pe = ${nl2(cpe, 2)}, c_pi = ${nl2(cpiHier, 2)}, w = ${nl2(stuwdruk.qp_kNm2, 3)}\xB7(${nl2(cpe, 2)} \u2212 ${nl2(cpiHier, 2)}) = ${nl2(w, 3)} kN/m\xB2, q = w\xB7${nl2(breedte_m, 2)} m = ${nl2(Math.abs(q), 3)} kN/m`
          });
        };
        if (g.rol === "gevelLinks" || g.rol === "gevelRechts") {
          const nx = g.rol === "gevelLinks" ? -1 : 1;
          let zone, cpe;
          if (richting === "haaks") {
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
            const loef = richting === "links" && g.rol === "gevelLinks" || richting === "rechts" && g.rol === "gevelRechts";
            zone = loef ? "D" : "E";
            cpe = loef ? cpeW.D : cpeW.E;
          }
          push(zone, cpe, TABEL_71_BRON, nx, 0, cpi);
          continue;
        }
        if (g.rol === "dakPlat" || g.rol === "dakHellend") {
          const n = dakNormaal(g);
          if (richting === "haaks") {
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
            const loef = richting === "links" && linkervlak || richting === "rechts" && !linkervlak;
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
          const xAccent = (xMm) => richting === "links" ? (xMm - xLinks) / 1e3 : (xRechts - xMm) / 1e3;
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
            const loef = richting === "links" && linkervlak || richting === "rechts" && !linkervlak;
            cpeBoven = loef ? inst.cpeDakLoef : inst.cpeDakLij;
            zoneBoven = loef ? "loefdakvlak" : "lijdakvlak";
            bronBoven = "NEN-EN 1991-1-4 tabel 7.4a (door de gebruiker ingevuld)";
          } else {
            const xAcc = richting === "rechts" ? (xRechts - midX) / 1e3 : (midX - xLinks) / 1e3;
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
          if (richting === "haaks") {
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
            const loef = richting === "links" && aanLinkerzijde || richting === "rechts" && !aanLinkerzijde;
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
    const G3 = eigen.filter((c) => c.type === "dead").map((c) => c.id);
    const Q2 = eigen.filter((c) => c.type === "live").map((c) => c.id);
    const S2 = eigen.filter((c) => c.type === "snow").map((c) => c.id);
    const overig = eigen.filter((c) => c.type === "other");
    if (overig.length > 0) {
      meldingen.push({
        niveau: "waarschuwing",
        tekst: `De belastinggevallen ${overig.map((c) => `\u201C${c.name}\u201D`).join(", ")} hebben type \u201Coverig\u201D. De generator kent daar geen \u03C8\u2080 bij en laat ze uit de gegenereerde combinaties. Geef ze een type, of neem ze handmatig op.`
      });
    }
    const mix = (paren) => paren.flatMap(([ids, f]) => ids.map((id) => [id, f]));
    for (const gv of gevallen) {
      const sets = [
        {
          naam: `UGT 6.10a \u2014 ${gv.naam}`,
          type: "uls",
          formule: "1,35\xB7G + 1,5\xB7\u03C8\u2080,W\xB7W + 1,5\xB7\u03C8\u2080,Q\xB7Q + 1,5\xB7\u03C8\u2080,S\xB7S",
          g: 1.35,
          wind: 1.5 * PSI0.wind,
          q: 1.5 * PSI0.veranderlijk,
          s: 1.5 * PSI0.sneeuw
        },
        {
          naam: `UGT 6.10b \u2014 ${gv.naam} leidend`,
          type: "uls",
          formule: "1,2\xB7G + 1,5\xB7W + 1,5\xB7\u03C8\u2080,Q\xB7Q + 1,5\xB7\u03C8\u2080,S\xB7S",
          g: 1.2,
          wind: 1.5,
          q: 1.5 * PSI0.veranderlijk,
          s: 1.5 * PSI0.sneeuw
        },
        {
          naam: `UGT EQU \u2014 ${gv.naam}, gunstig eigen gewicht`,
          type: "uls",
          formule: "0,9\xB7G + 1,5\xB7W",
          g: 0.9,
          wind: 1.5,
          q: 0,
          s: 0
        },
        {
          naam: `BGT karakteristiek \u2014 ${gv.naam} leidend`,
          type: "sls",
          formule: "G + W + \u03C8\u2080,Q\xB7Q + \u03C8\u2080,S\xB7S",
          g: 1,
          wind: 1,
          q: PSI0.veranderlijk,
          s: PSI0.sneeuw
        }
      ];
      for (const s of sets) {
        combinaties.push({
          naam: WIND_COMBI_PREFIX + s.naam,
          type: s.type,
          formule: `${s.formule}   [${GAMMA_BRON}; \u03C8\u2080 uit ${PSI0_BRON}]`,
          factorenPerCaseId: mix([[G3, s.g], [Q2, s.q], [S2, s.s]]).filter(([, f]) => f !== 0),
          windSleutel: gv.sleutel,
          windFactor: s.wind
        });
      }
    }
    meldingen.push({
      niveau: "waarschuwing",
      tekst: "De gegenereerde combinaties passen de betrouwbaarheidsfactor K_FI van de gevolgklasse NIET toe \u2014 net als de standaardcombinaties van dit programma. Bij gevolgklasse CC3 moet u de factoren zelf verhogen."
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
    }
  };
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
export {
  BEAM_LOAD_ROLES,
  BEAM_LOAD_ROLE_LABEL,
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
  E_STAAL,
  G2 as G,
  K_I,
  MELDING_ZONE_I,
  PLATE_DEFAULTS,
  PROJECT_FILE_EXT,
  PROJECT_FORMAT_VERSION,
  RHO_LUCHT,
  RHO_STAAL,
  STANDAARD_WIND_INSTELLINGEN,
  SUPPORTED_TIMBER_GRADES,
  TABEL_71_BRON,
  TERREIN_CATEGORIEEN,
  TIMBER_E_MEAN,
  TIMBER_RHO_MEAN,
  WINDGEBIEDEN,
  WIND_COMBI_PREFIX,
  Z0_II,
  ZMAX_M,
  beamLengthMm,
  bepaalStandaardRol,
  berekenE,
  berekenPlaatMeshSignatuur,
  berekenStuwdruk,
  bouwMultiInput,
  buildForcesEnvelope,
  buildMatrices,
  buildSteelCheckInputs,
  buildTimberCheckInputs,
  combinationsFromFile,
  combinationsToFile,
  combineResults,
  commitPlaatMeshCache,
  computeEnvelope,
  cpeWand,
  defaultCombinations,
  deserializeProject,
  eigenGewichtPerMeter,
  equivalentUdlFromMoments,
  extractFieldDeflectionMm,
  genereerWindbelasting,
  getSecondOrderState,
  handmatigeStuwdruk,
  handtekeningVanGeneratie,
  handtekeningVanModel,
  isAsgelijndeRechthoek,
  isSteelProfile,
  leesPlaatMeshCache,
  leesPolygoonRandlasten,
  liftSpringK,
  mapDeflectionClass,
  mapLoadDuration,
  mapServiceClass,
  matchSupportedTimberGrade,
  parseRechthoek,
  parseTimberRectMm,
  profileLookupKey,
  registreerPlaatMeshCacheCommitter,
  registreerPlaatMeshCaches,
  registreerPolygoonRandlasten,
  resolveSection,
  rolVanStaaf,
  sanitizeRestraintFractions,
  serializeProject,
  solve,
  solveAllCases,
  solveAllCasesNonlinear,
  solveCombinationSecondOrder,
  startSidecar,
  timberDeflectionNumerators,
  valideerPlaatPolygoon,
  verwerkRegel,
  verwerkVerzoek,
  withPlateDefaults
};
