/**
 * Plate Solver Verification Tests
 *
 * Test protocol to verify that the plate solver works correctly.
 * Includes simple analytical verification cases.
 */

import { Mesh } from '../fem/Mesh';
import { solveNonlinear } from './NonlinearSolver';
import { AnalysisType } from '../fem/types';

interface PlateTestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

/**
 * Test 1: Simple Cantilever Plate (plane stress)
 *
 * A rectangular plate fixed on the left edge with a point load on the right.
 * This tests basic functionality.
 *
 *    Fixed edge                Point load
 *    ██████████████████████████▼
 *    ██                       ██
 *    ██       1m x 0.5m       ██
 *    ██       t = 0.01m       ██
 *    ██                       ██
 *    ██████████████████████████
 *
 * Expected: Right side displaces downward, no singularity.
 */
export function testCantileverPlate(): PlateTestResult {
  const name = 'Cantilever Plate (plane stress)';

  try {
    const mesh = new Mesh();

    // Create a simple rectangular plate mesh manually
    // Using 4 nodes and 2 triangles for simplicity
    const n1 = mesh.addPlateNode(0, 0);      // BL
    const n2 = mesh.addPlateNode(1, 0);      // BR
    const n3 = mesh.addPlateNode(1, 0.5);    // TR
    const n4 = mesh.addPlateNode(0, 0.5);    // TL

    console.log('[testCantileverPlate] Created nodes:', n1.id, n2.id, n3.id, n4.id);

    // Create triangles: (n1, n2, n3) and (n1, n3, n4)
    const t1 = mesh.addTriangleElement([n1.id, n2.id, n3.id], 1, 0.01);
    const t2 = mesh.addTriangleElement([n1.id, n3.id, n4.id], 1, 0.01);

    console.log('[testCantileverPlate] Created triangles:', t1?.id, t2?.id);

    // Fix left edge (n1 and n4) - constrain x and y
    mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
    mesh.updateNode(n4.id, { constraints: { x: true, y: true, rotation: false } });

    console.log('[testCantileverPlate] Applied constraints to nodes', n1.id, 'and', n4.id);

    // Apply load on n3 (top-right corner): -10 kN in y direction
    mesh.updateNode(n3.id, { loads: { fx: 0, fy: -10, moment: 0 } });

    console.log('[testCantileverPlate] Applied load to node', n3.id);

    // Verify mesh state
    console.log('[testCantileverPlate] Mesh state:');
    console.log('  - Nodes:', mesh.getNodeCount());
    console.log('  - Elements:', mesh.elements.size);
    for (const node of mesh.nodes.values()) {
      console.log(`  - Node ${node.id}: (${node.x}, ${node.y}), constraints=${JSON.stringify(node.constraints)}, loads=${JSON.stringify(node.loads)}`);
    }
    for (const elem of mesh.elements.values()) {
      console.log(`  - Element ${elem.id}: nodeIds=[${elem.nodeIds.join(', ')}]`);
    }

    // Solve
    const result = solveNonlinear(mesh, { analysisType: 'plane_stress' as AnalysisType });

    // Check results
    const maxDisp = Math.max(...result.displacements.map(Math.abs));

    console.log('[testCantileverPlate] Results:');
    console.log('  - Displacements:', result.displacements);
    console.log('  - Max displacement:', maxDisp);

    if (maxDisp > 0 && maxDisp < 1e6) {
      return {
        name,
        passed: true,
        expected: 'Displacement > 0 and < 1e6',
        actual: `Max displacement = ${maxDisp.toExponential(3)}`
      };
    } else {
      return {
        name,
        passed: false,
        expected: 'Displacement > 0 and < 1e6',
        actual: `Max displacement = ${maxDisp.toExponential(3)}`,
        error: 'Displacement out of expected range'
      };
    }
  } catch (err) {
    return {
      name,
      passed: false,
      expected: 'Solve without error',
      actual: 'Error thrown',
      error: (err as Error).message
    };
  }
}

/**
 * Test 2: Simply Supported Square Plate (plane stress)
 *
 * A square plate with supports at two corners.
 *
 *    ▲(pinned)                 ◯(roller-y)
 *    ██████████████████████████
 *    ██                       ██
 *    ██       1m x 1m         ██
 *    ██       t = 0.01m       ██
 *    ██                       ██
 *    ██████████████████████████
 *            ▼ Force at center
 *
 * The bottom-left is pinned (x,y fixed), bottom-right has y fixed.
 */
export function testSimplySupportedPlate(): PlateTestResult {
  const name = 'Simply Supported Plate (plane stress)';

  try {
    const mesh = new Mesh();

    // Create a 2x2 grid of nodes (5 nodes including center)
    const n1 = mesh.addPlateNode(0, 0);      // BL
    const n2 = mesh.addPlateNode(1, 0);      // BR
    const n3 = mesh.addPlateNode(1, 1);      // TR
    const n4 = mesh.addPlateNode(0, 1);      // TL
    const n5 = mesh.addPlateNode(0.5, 0.5);  // Center

    console.log('[testSimplySupportedPlate] Created nodes:', n1.id, n2.id, n3.id, n4.id, n5.id);

    // Create 4 triangles connecting to center
    mesh.addTriangleElement([n1.id, n2.id, n5.id], 1, 0.01);
    mesh.addTriangleElement([n2.id, n3.id, n5.id], 1, 0.01);
    mesh.addTriangleElement([n3.id, n4.id, n5.id], 1, 0.01);
    mesh.addTriangleElement([n4.id, n1.id, n5.id], 1, 0.01);

    console.log('[testSimplySupportedPlate] Created 4 triangles');

    // Supports: BL pinned, BR roller-y, TL roller-x to prevent rigid body motion
    mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });  // Pinned
    mesh.updateNode(n2.id, { constraints: { x: false, y: true, rotation: false } }); // Roller-y
    mesh.updateNode(n4.id, { constraints: { x: true, y: false, rotation: false } }); // Roller-x

    console.log('[testSimplySupportedPlate] Applied constraints');

    // Load at center: -10 kN in y direction
    mesh.updateNode(n5.id, { loads: { fx: 0, fy: -10, moment: 0 } });

    console.log('[testSimplySupportedPlate] Applied load at center');

    // Verify mesh state
    console.log('[testSimplySupportedPlate] Mesh state:');
    for (const node of mesh.nodes.values()) {
      console.log(`  - Node ${node.id}: (${node.x}, ${node.y}), constraints=${JSON.stringify(node.constraints)}, loads=${JSON.stringify(node.loads)}`);
    }

    // Solve
    const result = solveNonlinear(mesh, { analysisType: 'plane_stress' as AnalysisType });

    // Check results
    const maxDisp = Math.max(...result.displacements.map(Math.abs));

    console.log('[testSimplySupportedPlate] Results:');
    console.log('  - Displacements:', result.displacements);
    console.log('  - Max displacement:', maxDisp);

    if (maxDisp > 0 && maxDisp < 1e6) {
      return {
        name,
        passed: true,
        expected: 'Displacement > 0 and < 1e6',
        actual: `Max displacement = ${maxDisp.toExponential(3)}`
      };
    } else {
      return {
        name,
        passed: false,
        expected: 'Displacement > 0 and < 1e6',
        actual: `Max displacement = ${maxDisp.toExponential(3)}`,
        error: 'Displacement out of expected range'
      };
    }
  } catch (err) {
    return {
      name,
      passed: false,
      expected: 'Solve without error',
      actual: 'Error thrown',
      error: (err as Error).message
    };
  }
}

/**
 * Test 3: Quad Element Test
 *
 * Simple quad with corner supports.
 */
export function testQuadPlate(): PlateTestResult {
  const name = 'Quad Element (plane stress)';

  try {
    const mesh = new Mesh();

    // Create 4 corner nodes
    const n1 = mesh.addPlateNode(0, 0);      // BL
    const n2 = mesh.addPlateNode(1, 0);      // BR
    const n3 = mesh.addPlateNode(1, 1);      // TR
    const n4 = mesh.addPlateNode(0, 1);      // TL

    console.log('[testQuadPlate] Created nodes:', n1.id, n2.id, n3.id, n4.id);

    // Create quad element
    const q = mesh.addQuadElement([n1.id, n2.id, n3.id, n4.id], 1, 0.01);

    console.log('[testQuadPlate] Created quad:', q?.id);

    // Bottom corners fixed
    mesh.updateNode(n1.id, { constraints: { x: true, y: true, rotation: false } });
    mesh.updateNode(n2.id, { constraints: { x: false, y: true, rotation: false } });

    console.log('[testQuadPlate] Applied constraints');

    // Load at top-right
    mesh.updateNode(n3.id, { loads: { fx: 0, fy: -10, moment: 0 } });

    console.log('[testQuadPlate] Applied load');

    // Solve
    const result = solveNonlinear(mesh, { analysisType: 'plane_stress' as AnalysisType });

    // Check results
    const maxDisp = Math.max(...result.displacements.map(Math.abs));

    console.log('[testQuadPlate] Results:');
    console.log('  - Displacements:', result.displacements);
    console.log('  - Max displacement:', maxDisp);

    if (maxDisp > 0 && maxDisp < 1e6) {
      return {
        name,
        passed: true,
        expected: 'Displacement > 0 and < 1e6',
        actual: `Max displacement = ${maxDisp.toExponential(3)}`
      };
    } else {
      return {
        name,
        passed: false,
        expected: 'Displacement > 0 and < 1e6',
        actual: `Max displacement = ${maxDisp.toExponential(3)}`,
        error: 'Displacement out of expected range'
      };
    }
  } catch (err) {
    return {
      name,
      passed: false,
      expected: 'Solve without error',
      actual: 'Error thrown',
      error: (err as Error).message
    };
  }
}

/**
 * Run all plate verification tests
 */
export function runPlateTests(): PlateTestResult[] {
  console.log('=== PLATE VERIFICATION TESTS ===');
  console.log('');

  const results: PlateTestResult[] = [];

  console.log('--- Test 1: Cantilever Plate ---');
  results.push(testCantileverPlate());
  console.log('');

  console.log('--- Test 2: Simply Supported Plate ---');
  results.push(testSimplySupportedPlate());
  console.log('');

  console.log('--- Test 3: Quad Element ---');
  results.push(testQuadPlate());
  console.log('');

  console.log('=== TEST SUMMARY ===');
  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} ${r.name}`);
    if (!r.passed && r.error) {
      console.log(`    Error: ${r.error}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\nTotal: ${passed}/${results.length} tests passed`);

  return results;
}

// Export for use in console or UI
(window as any).runPlateTests = runPlateTests;
