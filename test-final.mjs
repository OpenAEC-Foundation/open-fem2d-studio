/**
 * Final plate solver tests
 */

import { chromium } from 'playwright';

async function runTest() {
  console.log('🔧 Final Plate Tests\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Plate Solver') || text.includes('Transfer') || text.includes('PASS') || text.includes('FAIL')) {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    try { await page.click('.proj-info-btn.cancel', { timeout: 1000 }); } catch (e) {}

    const results = await page.evaluate(async () => {
      const { Mesh } = await import('/src/core/fem/Mesh.ts');
      const { solveNonlinear } = await import('/src/core/solver/NonlinearSolver.ts');

      const tests = [];

      // Test 1: Direct plate nodes (should work)
      try {
        const mesh1 = new Mesh();
        const n1 = mesh1.addPlateNode(0, 0);
        const n2 = mesh1.addPlateNode(2, 0);
        const n3 = mesh1.addPlateNode(2, 1);
        const n4 = mesh1.addPlateNode(0, 1);
        mesh1.addQuadElement([n1.id, n2.id, n3.id, n4.id], 1, 0.02);
        mesh1.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh1.updateNode(n2.id, { constraints: { x: false, y: true, rotation: false } });
        mesh1.updateNode(n3.id, { loads: { fx: 0, fy: -10, moment: 0 } });
        const r1 = solveNonlinear(mesh1, { analysisType: 'plane_stress' });
        tests.push({ name: 'Direct plate nodes', passed: true, maxDisp: Math.max(...r1.displacements.map(Math.abs)) });
      } catch (e) {
        tests.push({ name: 'Direct plate nodes', passed: false, error: e.message });
      }

      // Test 2: UI nodes with transfer (simulates real UI workflow)
      try {
        const mesh2 = new Mesh();
        const p1 = mesh2.addPlateNode(0, 0);
        const p2 = mesh2.addPlateNode(2, 0);
        const p3 = mesh2.addPlateNode(2, 1);
        const p4 = mesh2.addPlateNode(0, 1);
        mesh2.addQuadElement([p1.id, p2.id, p3.id, p4.id], 1, 0.02);
        // UI adds regular nodes at same positions
        const ui1 = mesh2.addNode(0, 0);
        const ui2 = mesh2.addNode(2, 0);
        mesh2.updateNode(ui1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh2.updateNode(ui2.id, { constraints: { x: false, y: true, rotation: false } });
        mesh2.updateNode(p3.id, { loads: { fx: 0, fy: -10, moment: 0 } });
        const r2 = solveNonlinear(mesh2, { analysisType: 'plane_stress' });
        tests.push({ name: 'UI nodes with transfer', passed: true, maxDisp: Math.max(...r2.displacements.map(Math.abs)) });
      } catch (e) {
        tests.push({ name: 'UI nodes with transfer', passed: false, error: e.message });
      }

      // Test 3: Multiple elements
      try {
        const mesh3 = new Mesh();
        const nodes = [];
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            nodes.push(mesh3.addPlateNode(i, j));
          }
        }
        const idx = (i, j) => j * 3 + i;
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            mesh3.addQuadElement([
              nodes[idx(i, j)].id,
              nodes[idx(i+1, j)].id,
              nodes[idx(i+1, j+1)].id,
              nodes[idx(i, j+1)].id
            ], 1, 0.02);
          }
        }
        mesh3.updateNode(nodes[0].id, { constraints: { x: true, y: true, rotation: false } });
        mesh3.updateNode(nodes[1].id, { constraints: { x: false, y: true, rotation: false } });
        mesh3.updateNode(nodes[2].id, { constraints: { x: false, y: true, rotation: false } });
        mesh3.updateNode(nodes[7].id, { loads: { fx: 0, fy: -10, moment: 0 } });
        const r3 = solveNonlinear(mesh3, { analysisType: 'plane_stress' });
        tests.push({ name: '2x2 mesh (4 quads)', passed: true, maxDisp: Math.max(...r3.displacements.map(Math.abs)) });
      } catch (e) {
        tests.push({ name: '2x2 mesh (4 quads)', passed: false, error: e.message });
      }

      // Test 4: Triangles
      try {
        const mesh4 = new Mesh();
        const t1 = mesh4.addPlateNode(0, 0);
        const t2 = mesh4.addPlateNode(2, 0);
        const t3 = mesh4.addPlateNode(1, 1.5);
        mesh4.addTriangleElement([t1.id, t2.id, t3.id], 1, 0.02);
        mesh4.updateNode(t1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh4.updateNode(t2.id, { constraints: { x: false, y: true, rotation: false } });
        mesh4.updateNode(t3.id, { loads: { fx: 0, fy: -10, moment: 0 } });
        const r4 = solveNonlinear(mesh4, { analysisType: 'plane_stress' });
        tests.push({ name: 'Single triangle', passed: true, maxDisp: Math.max(...r4.displacements.map(Math.abs)) });
      } catch (e) {
        tests.push({ name: 'Single triangle', passed: false, error: e.message });
      }

      // Test 5: Load transfer
      try {
        const mesh5 = new Mesh();
        const p1 = mesh5.addPlateNode(0, 0);
        const p2 = mesh5.addPlateNode(2, 0);
        const p3 = mesh5.addPlateNode(2, 1);
        const p4 = mesh5.addPlateNode(0, 1);
        mesh5.addQuadElement([p1.id, p2.id, p3.id, p4.id], 1, 0.02);
        mesh5.updateNode(p1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh5.updateNode(p2.id, { constraints: { x: false, y: true, rotation: false } });
        // Load on UI node at same position as p3
        const uiLoad = mesh5.addNode(2, 1);
        mesh5.updateNode(uiLoad.id, { loads: { fx: 0, fy: -10, moment: 0 } });
        const r5 = solveNonlinear(mesh5, { analysisType: 'plane_stress' });
        tests.push({ name: 'Load transfer', passed: true, maxDisp: Math.max(...r5.displacements.map(Math.abs)) });
      } catch (e) {
        tests.push({ name: 'Load transfer', passed: false, error: e.message });
      }

      return tests;
    });

    console.log('\n📊 RESULTS');
    console.log('==========');
    let passed = 0, failed = 0;
    for (const t of results) {
      if (t.passed) {
        console.log(`✅ ${t.name}: maxDisp = ${t.maxDisp?.toExponential(3)}`);
        passed++;
      } else {
        console.log(`❌ ${t.name}: ${t.error}`);
        failed++;
      }
    }
    console.log(`\n📈 Total: ${passed}/${results.length} passed`);

  } finally {
    await browser.close();
  }
}

runTest();
