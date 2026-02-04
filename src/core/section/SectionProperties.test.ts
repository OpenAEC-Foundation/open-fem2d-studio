/**
 * Test/validation for SectionProperties calculations
 *
 * Compares calculated values with known values from steel tables.
 * All dimensions in mm, results in mm², mm³, mm⁴
 */

import {
  calculateSectionProperties,
  calculatePlasticModulus,
  createISection,
  createRHS,
  createCHS,
  createChannel,
  createRectangle,
  createCircle,
  SectionGeometry,
} from './SectionProperties';

interface ValidationResult {
  name: string;
  property: string;
  calculated: number;
  expected: number;
  error: number;  // percentage error
  pass: boolean;
}

function formatNumber(n: number, decimals: number = 2): string {
  if (Math.abs(n) >= 1e6) {
    return (n / 1e6).toFixed(decimals) + 'e6';
  } else if (Math.abs(n) >= 1e3) {
    return (n / 1e3).toFixed(decimals) + 'e3';
  }
  return n.toFixed(decimals);
}

function validate(
  name: string,
  property: string,
  calculated: number,
  expected: number,
  tolerance: number = 0.02  // 2% default tolerance
): ValidationResult {
  const error = expected !== 0 ? Math.abs((calculated - expected) / expected) : (calculated === 0 ? 0 : 1);
  return {
    name,
    property,
    calculated,
    expected,
    error: error * 100,
    pass: error <= tolerance
  };
}

/**
 * Run validation tests against known steel profile data
 */
export function runValidationTests(): ValidationResult[] {
  const results: ValidationResult[] = [];

  // ============================================================================
  // IPE 200 (European I-beam)
  // Source: ArcelorMittal / Eurocode tables
  // h=200, b=100, tw=5.6, tf=8.5, r=12 (fillet ignored in our calc)
  // ============================================================================
  {
    const name = 'IPE 200';
    // Without fillet radius, our values will be slightly lower
    const geom = createISection(200, 100, 5.6, 8.5);
    const props = calculateSectionProperties(geom);

    // Expected values (with fillet: A=2848mm², Iy=19.4e6mm⁴, Wy=194e3mm³)
    // Without fillet: slightly less
    const expectedA = 2848; // mm² (with fillet)
    const expectedIy = 19.4e6; // mm⁴ (Iyy in our notation = strong axis)
    const expectedWy = 194e3; // mm³

    results.push(validate(name, 'Area', props.A, expectedA, 0.10)); // 10% tolerance due to fillet
    results.push(validate(name, 'Ixx (strong)', props.Ixx_c, expectedIy, 0.15));
    results.push(validate(name, 'Wx (strong)', props.Wx, expectedWy, 0.15));
  }

  // ============================================================================
  // HEA 200
  // h=190, b=200, tw=6.5, tf=10, r=18
  // A=5383mm², Iy=36.9e6mm⁴, Iz=13.4e6mm⁴
  // ============================================================================
  {
    const name = 'HEA 200';
    const geom = createISection(190, 200, 6.5, 10);
    const props = calculateSectionProperties(geom);

    const expectedA = 5383;
    const expectedIy = 36.9e6;
    const expectedIz = 13.4e6;

    results.push(validate(name, 'Area', props.A, expectedA, 0.10));
    results.push(validate(name, 'Ixx (strong)', props.Ixx_c, expectedIy, 0.15));
    results.push(validate(name, 'Iyy (weak)', props.Iyy_c, expectedIz, 0.15));
  }

  // ============================================================================
  // RHS 100x50x4 (Rectangular Hollow Section)
  // h=100, b=50, t=4
  // A=1104mm² (approx, depends on corner radius)
  // ============================================================================
  {
    const name = 'RHS 100x50x4';
    const geom = createRHS(100, 50, 4);
    const props = calculateSectionProperties(geom);

    // Without corner radius: A = 2*(100+50-2*4)*4 = 2*192*4 = 1536? No...
    // A = 100*50 - (100-8)*(50-8) = 5000 - 92*42 = 5000 - 3864 = 1136mm²
    const expectedA = 1136;

    results.push(validate(name, 'Area', props.A, expectedA, 0.05));
  }

  // ============================================================================
  // CHS 114.3x4 (Circular Hollow Section)
  // d=114.3, t=4
  // A = π/4 * (114.3² - 106.3²) = π/4 * (13064.5 - 11299.7) = π/4 * 1764.8 = 1386mm²
  // ============================================================================
  {
    const name = 'CHS 114.3x4';
    const d = 114.3;
    const t = 4;
    const geom = createCHS(d, t, 64); // Use more segments for accuracy
    const props = calculateSectionProperties(geom);

    const expectedA = Math.PI / 4 * (d * d - (d - 2 * t) * (d - 2 * t));

    results.push(validate(name, 'Area', props.A, expectedA, 0.02));
  }

  // ============================================================================
  // Solid Rectangle 100x50
  // A = 5000mm²
  // Ixx = bh³/12 = 50*100³/12 = 4.167e6mm⁴
  // Iyy = hb³/12 = 100*50³/12 = 1.042e6mm⁴
  // ============================================================================
  {
    const name = 'Rectangle 100x50';
    const h = 100, b = 50;
    const geom = createRectangle(h, b);
    const props = calculateSectionProperties(geom);

    const expectedA = b * h;
    const expectedIxx = b * h * h * h / 12;
    const expectedIyy = h * b * b * b / 12;
    const expectedWx = b * h * h / 6;

    results.push(validate(name, 'Area', props.A, expectedA, 0.001));
    results.push(validate(name, 'Ixx', props.Ixx_c, expectedIxx, 0.001));
    results.push(validate(name, 'Iyy', props.Iyy_c, expectedIyy, 0.001));
    results.push(validate(name, 'Wx', props.Wx, expectedWx, 0.001));
  }

  // ============================================================================
  // Solid Circle d=100
  // A = πd²/4 = 7854mm²
  // I = πd⁴/64 = 4.909e6mm⁴
  // ============================================================================
  {
    const name = 'Circle d=100';
    const d = 100;
    const geom = createCircle(d, 64);
    const props = calculateSectionProperties(geom);

    const expectedA = Math.PI * d * d / 4;
    const expectedI = Math.PI * d * d * d * d / 64;

    results.push(validate(name, 'Area', props.A, expectedA, 0.01));
    results.push(validate(name, 'Ixx', props.Ixx_c, expectedI, 0.02));
    results.push(validate(name, 'Iyy', props.Iyy_c, expectedI, 0.02));
  }

  return results;
}

/**
 * Print validation results to console
 */
export function printValidationResults(results: ValidationResult[]): void {
  console.log('\n========== Section Properties Validation ==========\n');

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    const status = r.pass ? '✓ PASS' : '✗ FAIL';
    const errorStr = r.error.toFixed(2) + '%';
    console.log(
      `${status} | ${r.name.padEnd(20)} | ${r.property.padEnd(15)} | ` +
      `calc: ${formatNumber(r.calculated).padStart(12)} | ` +
      `exp: ${formatNumber(r.expected).padStart(12)} | ` +
      `error: ${errorStr.padStart(8)}`
    );

    if (r.pass) passCount++;
    else failCount++;
  }

  console.log('\n---------------------------------------------------');
  console.log(`Total: ${results.length} tests | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('===================================================\n');
}

/**
 * Demo: Calculate and display properties for various profiles
 */
export function demoSectionProperties(): void {
  console.log('\n========== Section Properties Demo ==========\n');

  const profiles: Array<{ name: string; geom: SectionGeometry }> = [
    { name: 'IPE 200', geom: createISection(200, 100, 5.6, 8.5) },
    { name: 'HEA 200', geom: createISection(190, 200, 6.5, 10) },
    { name: 'RHS 100x50x4', geom: createRHS(100, 50, 4) },
    { name: 'CHS 114.3x4', geom: createCHS(114.3, 4, 48) },
    { name: 'UNP 200', geom: createChannel(200, 75, 8.5, 11.5) },
    { name: 'Rectangle 200x100', geom: createRectangle(200, 100) },
  ];

  for (const { name, geom } of profiles) {
    const props = calculateSectionProperties(geom);
    const Wpl_x = calculatePlasticModulus(geom, 'x');
    const Wpl_y = calculatePlasticModulus(geom, 'y');

    console.log(`--- ${name} ---`);
    console.log(`  A     = ${formatNumber(props.A)} mm²`);
    console.log(`  Ixx   = ${formatNumber(props.Ixx_c)} mm⁴`);
    console.log(`  Iyy   = ${formatNumber(props.Iyy_c)} mm⁴`);
    console.log(`  Wx    = ${formatNumber(props.Wx)} mm³`);
    console.log(`  Wy    = ${formatNumber(props.Wy)} mm³`);
    console.log(`  Wpl,x = ${formatNumber(Wpl_x)} mm³`);
    console.log(`  Wpl,y = ${formatNumber(Wpl_y)} mm³`);
    console.log(`  rx    = ${props.rx.toFixed(2)} mm`);
    console.log(`  ry    = ${props.ry.toFixed(2)} mm`);
    console.log(`  xc    = ${props.xc.toFixed(2)} mm`);
    console.log(`  yc    = ${props.yc.toFixed(2)} mm`);
    console.log('');
  }
}

// Run if executed directly (for testing)
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  const results = runValidationTests();
  printValidationResults(results);
  demoSectionProperties();
}
