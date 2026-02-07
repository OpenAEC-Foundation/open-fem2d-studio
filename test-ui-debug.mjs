/**
 * Debug test: Check constraint on polygon vertex nodes
 */

import { chromium } from 'playwright';

async function runTest() {
  console.log('🔧 UI Plate Debug Test\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture ALL console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[') || text.includes('PASS') || text.includes('FAIL') || text.includes('Error') || text.includes('active')) {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Close startup dialog if present
    try { await page.click('.proj-info-btn.cancel', { timeout: 1000 }); } catch (e) {}
    await page.waitForTimeout(500);

    // Run comprehensive tests in browser context
    const results = await page.evaluate(async () => {
      const { Mesh } = await import('/src/core/fem/Mesh.ts');
      const { solveNonlinear } = await import('/src/core/solver/NonlinearSolver.ts');
      const { generatePolygonPlateMeshV2 } = await import('/src/core/fem/PlateRegion.ts');
      const { buildNodeIdToIndex } = await import('/src/core/solver/Assembler.ts');

      const tests = [];

      // === TEST 1: Basic plate with direct node constraints ===
      try {
        const mesh = new Mesh();
        const n1 = mesh.addPlateNode(0, 0);
        const n2 = mesh.addPlateNode(2, 0);
        const n3 = mesh.addPlateNode(2, 1);
        const n4 = mesh.addPlateNode(0, 1);
        mesh.addQuadElement([n1.id, n2.id, n3.id, n4.id], 1, 0.02);
        mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(n2.id, { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(n3.id, { loads: { fx: 0, fy: -10, moment: 0 } });

        const activeNodeIds = buildNodeIdToIndex(mesh, 'plane_stress');
        const constrainedNodeIsActive = activeNodeIds.has(n1.id) && activeNodeIds.has(n2.id);

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'Direct plate nodes',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs)),
          constrainedNodeIsActive
        });
      } catch (e) {
        tests.push({ name: 'Direct plate nodes', passed: false, error: e.message });
      }

      // === TEST 2: UI-style workflow with polygonPlateMesh ===
      try {
        const mesh = new Mesh();

        // Simulate drawing a polygon plate (as the UI does)
        const polygon = [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 0, y: 1 }
        ];

        // This is what the UI calls when drawing a plate
        const plate = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 1.0,
          materialId: 1,
          thickness: 0.02
        });
        mesh.addPlateRegion(plate);

        // Find the plate region (already added above)
        console.log('[Test] PlateRegion:', JSON.stringify({
          id: plate.id,
          nodeIds: plate.nodeIds,
          boundaryNodeIds: plate.boundaryNodeIds,
          polygon: plate.polygon
        }));

        // Find boundary nodes (the corner nodes)
        const boundaryNodeIds = plate.boundaryNodeIds || plate.nodeIds;
        console.log('[Test] Boundary node IDs:', boundaryNodeIds);

        // Get active nodes
        const activeNodeIds = buildNodeIdToIndex(mesh, 'plane_stress');
        console.log('[Test] Active node IDs:', Array.from(activeNodeIds.keys()));

        // Find nodes at polygon corners
        const cornerNodes = [];
        for (const pt of polygon) {
          for (const nodeId of boundaryNodeIds) {
            const node = mesh.getNode(nodeId);
            if (node && Math.abs(node.x - pt.x) < 0.01 && Math.abs(node.y - pt.y) < 0.01) {
              cornerNodes.push({ nodeId, x: node.x, y: node.y, isActive: activeNodeIds.has(nodeId) });
              break;
            }
          }
        }
        console.log('[Test] Corner nodes:', JSON.stringify(cornerNodes));

        // Apply constraints directly to corner nodes
        const n1 = cornerNodes[0];
        const n2 = cornerNodes[1];
        const n3 = cornerNodes[2];

        if (!n1 || !n2 || !n3) {
          throw new Error('Could not find corner nodes');
        }

        mesh.updateNode(n1.nodeId, { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(n2.nodeId, { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(n3.nodeId, { loads: { fx: 0, fy: -10, moment: 0 } });

        console.log('[Test] Applied constraints to:', n1.nodeId, n2.nodeId);
        console.log('[Test] Applied load to:', n3.nodeId);

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'Polygon mesh with corner constraints',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs)),
          cornerNodes
        });
      } catch (e) {
        tests.push({ name: 'Polygon mesh with corner constraints', passed: false, error: e.message });
      }

      // === TEST 3: Constraints on UI nodes (NOT on plate nodes) - should FAIL without transfer ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 0, y: 1 }
        ];

        const plate3 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 1.0,
          materialId: 1,
          thickness: 0.02
        });
        mesh.addPlateRegion(plate3);

        // Add REGULAR nodes at corner positions (this simulates what happens when user clicks)
        const ui1 = mesh.addNode(0, 0);  // NOT a plate node
        const ui2 = mesh.addNode(2, 0);  // NOT a plate node
        const ui3 = mesh.addNode(2, 1);  // NOT a plate node

        console.log('[Test] UI node IDs:', ui1.id, ui2.id, ui3.id);

        // Apply constraints to UI nodes
        mesh.updateNode(ui1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(ui2.id, { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(ui3.id, { loads: { fx: 0, fy: -10, moment: 0 } });

        // Check if UI nodes are active
        const activeNodeIds = buildNodeIdToIndex(mesh, 'plane_stress');
        console.log('[Test] UI node 1 is active:', activeNodeIds.has(ui1.id));
        console.log('[Test] UI node 2 is active:', activeNodeIds.has(ui2.id));

        // This should work because the solver has constraint transfer
        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'UI nodes with transfer (should work)',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'UI nodes with transfer (should work)', passed: false, error: e.message });
      }

      // === TEST 4: Coarse mesh (like real UI) ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 0, y: 2 }
        ];

        // Coarse mesh - fewer elements
        const plate4 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 2.0,
          materialId: 1,
          thickness: 0.1
        });
        mesh.addPlateRegion(plate4);

        console.log('[Test] Node count:', mesh.nodes.size);
        console.log('[Test] Element count:', mesh.elements.size);

        // Find nodes at corners
        let cornerNodeIds = [];
        for (const pt of polygon) {
          for (const node of mesh.nodes.values()) {
            if (Math.abs(node.x - pt.x) < 0.01 && Math.abs(node.y - pt.y) < 0.01) {
              cornerNodeIds.push(node.id);
              break;
            }
          }
        }
        console.log('[Test] Corner node IDs:', cornerNodeIds);

        // Apply constraints
        mesh.updateNode(cornerNodeIds[0], { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[1], { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[2], { loads: { fx: 0, fy: -10, moment: 0 } });

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'Coarse mesh 4x2',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'Coarse mesh 4x2', passed: false, error: e.message });
      }

      // === TEST 5: Triangle mesh ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 1.5, y: 2 }
        ];

        const plate5 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 1.0,
          materialId: 1,
          thickness: 0.02
        });
        mesh.addPlateRegion(plate5);

        // Find corner nodes
        let cornerNodeIds = [];
        for (const pt of polygon) {
          for (const node of mesh.nodes.values()) {
            if (Math.abs(node.x - pt.x) < 0.01 && Math.abs(node.y - pt.y) < 0.01) {
              cornerNodeIds.push(node.id);
              break;
            }
          }
        }

        mesh.updateNode(cornerNodeIds[0], { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[1], { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[2], { loads: { fx: 0, fy: -10, moment: 0 } });

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'Triangle polygon',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'Triangle polygon', passed: false, error: e.message });
      }

      // === TEST 6: L-shape polygon ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 0, y: 2 }
        ];

        const plate6 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 0.5,
          materialId: 1,
          thickness: 0.02
        });
        mesh.addPlateRegion(plate6);

        // Find corner nodes
        let cornerNodeIds = [];
        for (const pt of polygon) {
          for (const node of mesh.nodes.values()) {
            if (Math.abs(node.x - pt.x) < 0.01 && Math.abs(node.y - pt.y) < 0.01) {
              cornerNodeIds.push(node.id);
              break;
            }
          }
        }

        mesh.updateNode(cornerNodeIds[0], { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[1], { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[4], { loads: { fx: 0, fy: -10, moment: 0 } });

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'L-shape polygon',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'L-shape polygon', passed: false, error: e.message });
      }

      // === TEST 7: Very fine mesh ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 0, y: 1 }
        ];

        const plate7 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 0.25,
          materialId: 1,
          thickness: 0.02
        });
        mesh.addPlateRegion(plate7);

        console.log('[Test] Fine mesh node count:', mesh.nodes.size);
        console.log('[Test] Fine mesh element count:', mesh.elements.size);

        // Find corner nodes
        let cornerNodeIds = [];
        for (const pt of polygon) {
          for (const node of mesh.nodes.values()) {
            if (Math.abs(node.x - pt.x) < 0.01 && Math.abs(node.y - pt.y) < 0.01) {
              cornerNodeIds.push(node.id);
              break;
            }
          }
        }

        mesh.updateNode(cornerNodeIds[0], { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[1], { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(cornerNodeIds[2], { loads: { fx: 0, fy: -10, moment: 0 } });

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'Fine mesh',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'Fine mesh', passed: false, error: e.message });
      }

      // === TEST 8: Multiple supports ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 0, y: 2 }
        ];

        const plate8 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 1.0,
          materialId: 1,
          thickness: 0.1
        });
        mesh.addPlateRegion(plate8);

        // Find all bottom edge nodes
        const bottomNodes = [];
        for (const node of mesh.nodes.values()) {
          if (Math.abs(node.y) < 0.01) {
            bottomNodes.push(node.id);
          }
        }
        console.log('[Test] Bottom edge nodes:', bottomNodes);

        // Constrain all bottom edge nodes
        for (const nodeId of bottomNodes) {
          mesh.updateNode(nodeId, { constraints: { x: false, y: true, rotation: false } });
        }
        mesh.updateNode(bottomNodes[0], { constraints: { x: true, y: true, rotation: false } });

        // Add load at top
        for (const node of mesh.nodes.values()) {
          if (Math.abs(node.y - 2) < 0.01) {
            mesh.updateNode(node.id, { loads: { fx: 0, fy: -2, moment: 0 } });
          }
        }

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'Multiple supports on edge',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'Multiple supports on edge', passed: false, error: e.message });
      }

      // === TEST 9: Plane strain ===
      try {
        const mesh = new Mesh();
        const n1 = mesh.addPlateNode(0, 0);
        const n2 = mesh.addPlateNode(2, 0);
        const n3 = mesh.addPlateNode(2, 1);
        const n4 = mesh.addPlateNode(0, 1);
        mesh.addQuadElement([n1.id, n2.id, n3.id, n4.id], 1, 0.02);
        mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
        mesh.updateNode(n2.id, { constraints: { x: false, y: true, rotation: false } });
        mesh.updateNode(n3.id, { loads: { fx: 0, fy: -10, moment: 0 } });

        const r = solveNonlinear(mesh, { analysisType: 'plane_strain' });
        tests.push({
          name: 'Plane strain',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'Plane strain', passed: false, error: e.message });
      }

      // === TEST 10: UI node + existing plate node at same spot ===
      try {
        const mesh = new Mesh();

        const polygon = [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 0, y: 1 }
        ];

        const plate10 = await generatePolygonPlateMeshV2(mesh, {
          outline: polygon,
          meshSize: 1.0,
          materialId: 1,
          thickness: 0.02
        });
        mesh.addPlateRegion(plate10);

        // First, find the plate node at (0,0)
        let plateNodeAt00 = null;
        for (const node of mesh.nodes.values()) {
          if (Math.abs(node.x) < 0.01 && Math.abs(node.y) < 0.01 && node.id >= 1000) {
            plateNodeAt00 = node;
            break;
          }
        }
        console.log('[Test] Plate node at (0,0):', plateNodeAt00?.id);

        // Now add a UI node at the same spot
        const uiNode = mesh.addNode(0, 0);
        console.log('[Test] UI node at (0,0):', uiNode.id);

        // Apply constraint to UI node
        mesh.updateNode(uiNode.id, { constraints: { x: true, y: true, rotation: false } });

        // Find another plate corner node
        let plateNodeAt20 = null;
        for (const node of mesh.nodes.values()) {
          if (Math.abs(node.x - 2) < 0.01 && Math.abs(node.y) < 0.01 && node.id >= 1000) {
            plateNodeAt20 = node;
            break;
          }
        }
        mesh.updateNode(plateNodeAt20.id, { constraints: { x: false, y: true, rotation: false } });

        // Add load
        let plateNodeAt21 = null;
        for (const node of mesh.nodes.values()) {
          if (Math.abs(node.x - 2) < 0.01 && Math.abs(node.y - 1) < 0.01 && node.id >= 1000) {
            plateNodeAt21 = node;
            break;
          }
        }
        mesh.updateNode(plateNodeAt21.id, { loads: { fx: 0, fy: -10, moment: 0 } });

        const r = solveNonlinear(mesh, { analysisType: 'plane_stress' });
        tests.push({
          name: 'UI node + plate node same spot',
          passed: true,
          maxDisp: Math.max(...r.displacements.map(Math.abs))
        });
      } catch (e) {
        tests.push({ name: 'UI node + plate node same spot', passed: false, error: e.message });
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
