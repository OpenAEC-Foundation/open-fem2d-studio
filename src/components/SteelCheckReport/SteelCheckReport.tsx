/**
 * SteelCheckReport — Detailed NEN-EN 1993-1-1 steel check report for a single beam element.
 *
 * Section A: Cross-section & material properties
 * Section B: Internal forces from analysis
 * Section C: Unity checks with full formulas, substituted values and results
 *
 * Reuses calculation logic from SteelCheck.ts — does NOT duplicate formulas.
 */

import { useState, useMemo } from 'react';
import { useFEM } from '../../context/FEMContext';
import { STEEL_GRADES, ISteelGrade } from '../../core/standards/EurocodeNL';
import {
  checkSteelSection,
  ISectionProperties,
  ISteelCheckResult,
} from '../../core/standards/SteelCheck';
import { calculateBeamLength } from '../../core/fem/Beam';
import { IBeamForces, IBeamSection } from '../../core/fem/types';
import { convertArea } from '../../utils/units';
import './SteelCheckReport.css';

/* ──────────────────────────────────────────────────────────── */
/*  Props                                                       */
/* ──────────────────────────────────────────────────────────── */

interface SteelCheckReportProps {
  /** If provided, open the report for this specific beam element id */
  initialBeamId?: number;
  onClose: () => void;
}

/* ──────────────────────────────────────────────────────────── */
/*  Helpers                                                     */
/* ──────────────────────────────────────────────────────────── */

/** UC color class */
function ucColorClass(uc: number): string {
  if (uc < 0.7) return 'uc-green';
  if (uc <= 1.0) return 'uc-orange';
  return 'uc-red';
}

/** Format a number in engineering style (e.g. 3.456e-4) */
function eng(v: number, digits = 3): string {
  if (v === 0) return '0';
  return v.toExponential(digits);
}

/** Format value with fixed decimals */
function fix(v: number, d = 2): string {
  return v.toFixed(d);
}

/** Format force in kN */
function fkN(v: number): string {
  return (v / 1000).toFixed(2);
}

/** Format moment in kNm */
function fkNm(v: number): string {
  return (v / 1000).toFixed(2);
}

/** Format MPa from Pa */
function fMPa(v: number): string {
  return (v / 1e6).toFixed(1);
}

/** Determine cross-section class (simplified) */
function getCrossSectionClass(profileName: string, section: IBeamSection): number {
  if (section.Wply && section.Wy) {
    const ratio = section.Wply / section.Wy;
    if (ratio >= 1.10) return 1;
    if (ratio >= 1.05) return 2;
    return 3;
  }
  if (profileName.includes('IPE') || profileName.includes('HEA') || profileName.includes('HEB')) {
    return 1;
  }
  return 3;
}

/* ──────────────────────────────────────────────────────────── */
/*  Intermediate calculation data — extracted from SteelCheck   */
/*  logic for formula display purposes (mirrors SteelCheck.ts)  */
/* ──────────────────────────────────────────────────────────── */

interface IDetailedCalcData {
  // Material
  fy: number;       // Pa
  fu: number;       // Pa (for display)
  E: number;        // Pa
  G: number;        // Pa
  gammaM0: number;
  gammaM1: number;

  // Section
  A: number;        // m²
  Iy: number;       // m⁴
  Iz: number | null;
  Wy: number;       // m³ (elastic)
  Wply: number | null; // m³ (plastic)
  It: number | null;
  Iw: number | null;
  Av: number;       // shear area m²
  h: number;        // m
  b: number | null;  // mm
  tf: number | null; // mm
  tw: number | null; // mm

  // Length
  L: number;         // m

  // Resistances
  McRd: number;
  VcRd: number;
  NplRd: number;

  // LTB intermediate values
  ltb: {
    Mcr: number;
    lambdaLT: number;
    phiLT: number;
    chiLT: number;
    alphaLT: number;
    MbRd: number;
    C1: number;
    curve: string;
  } | null;

  // Buckling intermediate values
  buckling: {
    Ncr: number;
    lambda: number;
    phi: number;
    chi: number;
    alpha: number;
    NbRd: number;
    curve: string;
  } | null;

  // Deflection
  deflection: {
    actual: number;
    limit: number;
    divisor: number;
  } | null;
}

/** Imperfection factors alpha for buckling curves (same as SteelCheck.ts) */
const BUCKLING_ALPHA: Record<string, number> = {
  a0: 0.13,
  a: 0.21,
  b: 0.34,
  c: 0.49,
  d: 0.76,
};

/**
 * Extract detailed intermediate calculation data for formula display.
 * This mirrors the logic in SteelCheck.ts but exposes intermediate values.
 */
function getDetailedCalcData(
  sectionProps: ISectionProperties,
  beamSection: IBeamSection,
  grade: ISteelGrade,
  beamLength: number,
  maxDeflection: number,
  deflLimitDivisor: number
): IDetailedCalcData {
  const fy = grade.fy * 1e6;
  const fu = grade.fu * 1e6;
  const E = 210e9;
  const G = 81e9;

  const A = sectionProps.A;
  const Iy = sectionProps.I;
  const h = sectionProps.h;

  // Elastic section modulus
  const Wy = (sectionProps.Wel && sectionProps.Wel > 0) ? sectionProps.Wel : Iy / (h / 2);
  const Wply = beamSection.Wply ?? null;

  // Shear area
  let Av: number;
  if (sectionProps.tw && sectionProps.h) {
    const twM = (sectionProps.tw ?? 0) / 1000;
    const tfM = (sectionProps.tf ?? 0) / 1000;
    const hw = h - 2 * tfM;
    Av = Math.max(hw * twM, A * 0.5);
  } else {
    Av = A * 0.6;
  }

  // Resistances
  const NplRd = (A * fy) / grade.gammaM0;
  const McRd = (Wy * fy) / grade.gammaM0;
  const VcRd = (Av * (fy / Math.sqrt(3))) / grade.gammaM0;

  // Iz
  let Iz: number | null = sectionProps.Iz ?? null;
  if ((!Iz || Iz <= 0) && sectionProps.b && sectionProps.tf) {
    const bM = (sectionProps.b ?? 0) / 1000;
    const tfM = (sectionProps.tf ?? 0) / 1000;
    const twM = (sectionProps.tw ?? 0) / 1000;
    const hw = h - 2 * tfM;
    Iz = 2 * (tfM * Math.pow(bM, 3) / 12) + hw * Math.pow(twM, 3) / 12;
  }

  // It
  let It: number | null = sectionProps.It ?? null;
  if ((!It || It <= 0) && sectionProps.b && sectionProps.tf && sectionProps.tw) {
    const bM = (sectionProps.b ?? 0) / 1000;
    const tfM = (sectionProps.tf ?? 0) / 1000;
    const twM = (sectionProps.tw ?? 0) / 1000;
    const hw = h - 2 * tfM;
    It = 2 * (bM * Math.pow(tfM, 3) / 3) + hw * Math.pow(twM, 3) / 3;
  }

  // Iw
  let Iw: number | null = sectionProps.Iw ?? null;
  if ((!Iw || Iw <= 0) && Iz && Iz > 0 && sectionProps.tf) {
    const tfM = (sectionProps.tf ?? 0) / 1000;
    Iw = Iz * Math.pow(h - tfM, 2) / 4;
  }

  // LTB
  let ltb: IDetailedCalcData['ltb'] = null;
  if (beamLength > 0 && Iz && Iz > 0 && It && It > 0 && Iw && Iw > 0) {
    const C1 = 1.0;
    const kL = beamLength;
    const pi2EIz = Math.PI * Math.PI * E * Iz;
    const kL2 = kL * kL;
    const term1 = pi2EIz / kL2;
    const term2 = Math.sqrt(Iw / Iz + kL2 * G * It / pi2EIz);
    const Mcr = C1 * term1 * term2;

    if (Mcr > 0) {
      const lambdaLT = Math.sqrt(Wy * fy / Mcr);

      // Determine LTB buckling curve
      let curve = 'b';
      if (sectionProps.b && sectionProps.b > 0) {
        const hMm = h * 1000;
        const ratio = hMm / sectionProps.b;
        curve = ratio > 2 ? 'a' : 'b';
      }
      const alphaLT = BUCKLING_ALPHA[curve] ?? 0.34;

      let chiLT: number;
      let phiLT: number;
      if (lambdaLT <= 0.2) {
        chiLT = 1.0;
        phiLT = 0.5 * (1 + alphaLT * (lambdaLT - 0.2) + lambdaLT * lambdaLT);
      } else {
        phiLT = 0.5 * (1 + alphaLT * (lambdaLT - 0.2) + lambdaLT * lambdaLT);
        chiLT = Math.min(1 / (phiLT + Math.sqrt(phiLT * phiLT - lambdaLT * lambdaLT)), 1.0);
      }

      const MbRd = chiLT * Wy * fy / grade.gammaM1;

      ltb = { Mcr, lambdaLT, phiLT, chiLT, alphaLT, MbRd, C1, curve };
    }
  }

  // Flexural buckling
  let buckling: IDetailedCalcData['buckling'] = null;
  if (beamLength > 0) {
    const Ncr = Math.PI * Math.PI * E * Iy / (beamLength * beamLength);
    if (Ncr > 0) {
      const lambda = Math.sqrt(A * fy / Ncr);

      // Determine buckling curve
      let curve = 'b';
      if (sectionProps.b && sectionProps.b > 0 && sectionProps.tf) {
        const hMm = h * 1000;
        const ratio = hMm / sectionProps.b;
        if (ratio > 1.2) {
          curve = (sectionProps.tf ?? 0) <= 40 ? 'a' : 'b';
        } else {
          curve = (sectionProps.tf ?? 0) <= 100 ? 'b' : 'd';
        }
      }
      const alpha = BUCKLING_ALPHA[curve] ?? 0.34;

      let chi: number;
      let phi: number;
      if (lambda <= 0.2) {
        chi = 1.0;
        phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda * lambda);
      } else {
        phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda * lambda);
        chi = Math.min(1 / (phi + Math.sqrt(phi * phi - lambda * lambda)), 1.0);
      }

      const NbRd = chi * A * fy / grade.gammaM1;

      buckling = { Ncr, lambda, phi, chi, alpha, NbRd, curve };
    }
  }

  // Deflection
  let deflection: IDetailedCalcData['deflection'] = null;
  if (beamLength > 0 && maxDeflection > 0) {
    const limit = beamLength / deflLimitDivisor;
    deflection = { actual: Math.abs(maxDeflection), limit, divisor: deflLimitDivisor };
  }

  return {
    fy, fu, E, G,
    gammaM0: grade.gammaM0,
    gammaM1: grade.gammaM1,
    A, Iy, Iz, Wy, Wply, It, Iw, Av, h,
    b: sectionProps.b ?? (beamSection.b ? beamSection.b * 1000 : null),
    tf: sectionProps.tf ?? (beamSection.tf ? beamSection.tf * 1000 : null),
    tw: sectionProps.tw ?? (beamSection.tw ? beamSection.tw * 1000 : null),
    L: beamLength,
    McRd, VcRd, NplRd,
    ltb, buckling, deflection,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  Beam data extraction hook                                   */
/* ──────────────────────────────────────────────────────────── */

interface BeamReportData {
  beamId: number;
  profileName: string;
  section: IBeamSection;
  sectionProps: ISectionProperties;
  forces: IBeamForces;
  length: number;
  maxDeflection: number;
}

function useBeamDataMap(): Map<number, BeamReportData> {
  const { state } = useFEM();
  const { mesh, result } = state;

  return useMemo(() => {
    const map = new Map<number, BeamReportData>();
    if (!result || !result.beamForces) return map;

    for (const beam of mesh.beamElements.values()) {
      const forces = result.beamForces.get(beam.id);
      if (!forces) continue;

      const sectionFromCatalog = mesh.sections.get(beam.profileName || '');

      const sectionProps: ISectionProperties = {
        A: beam.section.A,
        I: beam.section.Iy ?? beam.section.I,
        h: beam.section.h,
        Wel: beam.section.Wy,
        b: beam.section.b ? beam.section.b * 1000 : undefined,   // m -> mm for SteelCheck
        tf: beam.section.tf ? beam.section.tf * 1000 : undefined, // m -> mm
        tw: beam.section.tw ? beam.section.tw * 1000 : undefined, // m -> mm
        Iz: sectionFromCatalog?.Iz ?? beam.section.Iz,
        It: beam.section.It,
        Iw: beam.section.Iw,
        profileName: beam.profileName,
      };

      const n1 = mesh.nodes.get(beam.nodeIds[0]);
      const n2 = mesh.nodes.get(beam.nodeIds[1]);
      let length = 0;
      let maxDeflection = 0;

      if (n1 && n2) {
        length = calculateBeamLength(n1, n2);

        // Calculate mid-span deflection using Hermite shape functions
        if (result.displacements && result.displacements.length > 0) {
          const dofsPerNode = state.analysisType === 'frame' ? 3 : 2;
          let nodeIndex1 = -1;
          let nodeIndex2 = -1;
          let idx = 0;
          for (const nodeId of mesh.nodes.keys()) {
            if (nodeId === beam.nodeIds[0]) nodeIndex1 = idx;
            if (nodeId === beam.nodeIds[1]) nodeIndex2 = idx;
            idx++;
          }

          if (nodeIndex1 >= 0 && nodeIndex2 >= 0) {
            const v1 = result.displacements[nodeIndex1 * dofsPerNode + 1] || 0;
            const v2 = result.displacements[nodeIndex2 * dofsPerNode + 1] || 0;
            const vAvg = (v1 + v2) / 2;

            if (dofsPerNode === 3) {
              const theta1 = result.displacements[nodeIndex1 * dofsPerNode + 2] || 0;
              const theta2 = result.displacements[nodeIndex2 * dofsPerNode + 2] || 0;
              const xi = 0.5;
              const N1h = 1 - 3 * xi * xi + 2 * xi * xi * xi;
              const N2h = length * xi * (1 - xi) * (1 - xi);
              const N3h = 3 * xi * xi - 2 * xi * xi * xi;
              const N4h = length * xi * xi * (xi - 1);
              const vMid = N1h * v1 + N2h * theta1 + N3h * v2 + N4h * theta2;
              maxDeflection = Math.abs(vMid - vAvg);
            } else {
              maxDeflection = Math.abs(v1 - vAvg);
            }
          }
        }
      }

      map.set(beam.id, {
        beamId: beam.id,
        profileName: beam.profileName || 'Unknown',
        section: beam.section,
        sectionProps,
        forces,
        length,
        maxDeflection,
      });
    }
    return map;
  }, [result, mesh, state.analysisType]);
}

/* ──────────────────────────────────────────────────────────── */
/*  Component                                                   */
/* ──────────────────────────────────────────────────────────── */

export function SteelCheckReport({ initialBeamId, onClose }: SteelCheckReportProps) {
  const { state } = useFEM();
  const { stressUnit, lengthUnit, forceUnit, momentUnit, areaUnit, steelCheckInterval } = state;
  const beamDataMap = useBeamDataMap();
  const beamIds = useMemo(() => Array.from(beamDataMap.keys()).sort((a, b) => a - b), [beamDataMap]);

  const [selectedBeamId, setSelectedBeamId] = useState<number>(() => {
    if (initialBeamId && beamDataMap.has(initialBeamId)) return initialBeamId;
    return beamIds[0] ?? -1;
  });
  const [gradeIdx, setGradeIdx] = useState(2); // S355 default
  const [deflLimitDivisor, setDeflLimitDivisor] = useState(250);

  const grade: ISteelGrade = STEEL_GRADES[gradeIdx];
  const beamData = beamDataMap.get(selectedBeamId);

  // Run check via existing function
  const checkResult: ISteelCheckResult | null = useMemo(() => {
    if (!beamData) return null;
    return checkSteelSection(
      beamData.sectionProps,
      beamData.forces,
      grade,
      beamData.length,
      beamData.maxDeflection,
      deflLimitDivisor,
      false,
      steelCheckInterval
    );
  }, [beamData, grade, deflLimitDivisor, steelCheckInterval]);

  // Detailed calc data for formula display
  const calcData: IDetailedCalcData | null = useMemo(() => {
    if (!beamData) return null;
    return getDetailedCalcData(
      beamData.sectionProps,
      beamData.section,
      grade,
      beamData.length,
      beamData.maxDeflection,
      deflLimitDivisor
    );
  }, [beamData, grade, deflLimitDivisor]);

  const handlePrint = () => {
    window.print();
  };

  if (beamIds.length === 0) {
    return (
      <div className="scr-overlay" onClick={onClose}>
        <div className="scr-dialog" onClick={e => e.stopPropagation()}>
          <div className="scr-header">
            <div>
              <div className="scr-header-title">Steel Check Report</div>
              <div className="scr-header-subtitle">NEN-NEN-EN 1993-1-1</div>
            </div>
          </div>
          <div className="scr-body">
            <div className="scr-no-data">
              No beam elements with analysis results available. Run the solver first.
            </div>
          </div>
          <div className="scr-footer">
            <span />
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scr-overlay" onClick={onClose}>
      <div className="scr-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="scr-header">
          <div>
            <div className="scr-header-title">Steel Check Report — NEN-EN 1993-1-1</div>
            <div className="scr-header-subtitle">Detailed unity checks with formulas (NL National Annex)</div>
          </div>
          <div className="scr-header-controls">
            <select
              className="scr-member-select"
              value={selectedBeamId}
              onChange={e => setSelectedBeamId(parseInt(e.target.value))}
            >
              {beamIds.map(id => {
                const bd = beamDataMap.get(id);
                return (
                  <option key={id} value={id}>
                    Member {id}{bd ? ` — ${bd.profileName}` : ''}
                  </option>
                );
              })}
            </select>
            <select
              value={gradeIdx}
              onChange={e => setGradeIdx(parseInt(e.target.value))}
            >
              {STEEL_GRADES.map((g, i) => (
                <option key={g.name} value={i}>{g.name}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              L/
              <input
                type="number"
                style={{
                  width: '44px', padding: '3px 4px', background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-light)', borderRadius: '4px',
                  color: 'var(--text-primary)', fontSize: '11px', textAlign: 'center'
                }}
                value={deflLimitDivisor}
                min={100}
                max={1000}
                step={50}
                onChange={e => setDeflLimitDivisor(parseInt(e.target.value) || 250)}
              />
            </label>
            <button onClick={handlePrint}>Print</button>
          </div>
        </div>

        {/* Body */}
        <div className="scr-body">
          {(!beamData || !checkResult || !calcData) ? (
            <div className="scr-no-data">Select a beam member to view the report.</div>
          ) : (
            <>
              {/* Status banner */}
              <div className={`scr-status ${checkResult.status === 'OK' ? 'pass' : 'fail'}`}>
                {checkResult.status === 'OK' ? 'PASS' : 'FAIL'}
                {' — '}UC<sub>max</sub> = {fix(checkResult.UC_max, 3)}
                <span className="scr-status-governing">
                  Governing: {checkResult.governingCheck}
                  {checkResult.governingLocation && (
                    <> at x = {(checkResult.governingLocation.position * 1000).toFixed(0)}mm ({checkResult.governingLocation.locationType})</>
                  )}
                </span>
              </div>

              {/* ── Section A: Cross-section properties ─────────── */}
              <div className="scr-section-heading">A. Cross-Section Properties</div>
              <table className="scr-props-table">
                <tbody>
                  <tr>
                    <td>Profile</td>
                    <td>{beamData.profileName}</td>
                  </tr>
                  <tr>
                    <td>A (cross-section area)</td>
                    <td>{eng(convertArea(calcData.A, areaUnit))} {areaUnit}</td>
                  </tr>
                  <tr>
                    <td>I<sub>y</sub> (strong axis)</td>
                    <td>{eng(calcData.Iy)} m{'\u2074'}</td>
                  </tr>
                  {calcData.Iz != null && (
                    <tr>
                      <td>I<sub>z</sub> (weak axis)</td>
                      <td>{eng(calcData.Iz)} m{'\u2074'}</td>
                    </tr>
                  )}
                  <tr>
                    <td>W<sub>el,y</sub> (elastic section modulus)</td>
                    <td>{eng(calcData.Wy)} m{'\u00B3'}</td>
                  </tr>
                  {calcData.Wply != null && (
                    <tr>
                      <td>W<sub>pl,y</sub> (plastic section modulus)</td>
                      <td>{eng(calcData.Wply)} m{'\u00B3'}</td>
                    </tr>
                  )}
                  {beamData.section.Wz != null && (
                    <tr>
                      <td>W<sub>el,z</sub></td>
                      <td>{eng(beamData.section.Wz)} m{'\u00B3'}</td>
                    </tr>
                  )}
                  {calcData.It != null && (
                    <tr>
                      <td>I<sub>t</sub> (torsion constant)</td>
                      <td>{eng(calcData.It)} m{'\u2074'}</td>
                    </tr>
                  )}
                  {calcData.Iw != null && (
                    <tr>
                      <td>I<sub>w</sub> (warping constant)</td>
                      <td>{eng(calcData.Iw)} m{'\u2076'}</td>
                    </tr>
                  )}
                  <tr>
                    <td>h (section height)</td>
                    <td>{fix(calcData.h * 1000, 1)} mm</td>
                  </tr>
                  {calcData.b != null && (
                    <tr>
                      <td>b (flange width)</td>
                      <td>{fix(calcData.b, 1)} mm</td>
                    </tr>
                  )}
                  {calcData.tf != null && (
                    <tr>
                      <td>t<sub>f</sub> (flange thickness)</td>
                      <td>{fix(calcData.tf, 1)} mm</td>
                    </tr>
                  )}
                  {calcData.tw != null && (
                    <tr>
                      <td>t<sub>w</sub> (web thickness)</td>
                      <td>{fix(calcData.tw, 1)} mm</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Material data */}
              <div className="scr-section-heading">A2. Material Properties</div>
              <table className="scr-props-table">
                <tbody>
                  <tr>
                    <td>Steel grade</td>
                    <td>{grade.name}</td>
                  </tr>
                  <tr>
                    <td>f<sub>y</sub> (yield strength)</td>
                    <td>{grade.fy} {stressUnit}</td>
                  </tr>
                  <tr>
                    <td>f<sub>u</sub> (ultimate strength)</td>
                    <td>{grade.fu} {stressUnit}</td>
                  </tr>
                  <tr>
                    <td>E (modulus of elasticity)</td>
                    <td>210 000 {stressUnit}</td>
                  </tr>
                  <tr>
                    <td>G (shear modulus)</td>
                    <td>81 000 {stressUnit}</td>
                  </tr>
                  <tr>
                    <td>{'\u03B3'}<sub>M0</sub></td>
                    <td>{fix(grade.gammaM0)}</td>
                  </tr>
                  <tr>
                    <td>{'\u03B3'}<sub>M1</sub></td>
                    <td>{fix(grade.gammaM1)}</td>
                  </tr>
                  <tr>
                    <td>Cross-section class</td>
                    <td>Class {getCrossSectionClass(beamData.profileName, beamData.section)}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Section B: Internal forces ──────────────────── */}
              <div className="scr-section-heading">B. Internal Forces (from analysis)</div>
              <table className="scr-forces-table">
                <thead>
                  <tr>
                    <th>Quantity</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>M<sub>Ed</sub> (design bending moment)</td>
                    <td>{fkNm(checkResult.MEd)} {momentUnit}</td>
                  </tr>
                  <tr>
                    <td>V<sub>Ed</sub> (design shear force)</td>
                    <td>{fkN(checkResult.VEd)} {forceUnit}</td>
                  </tr>
                  <tr>
                    <td>N<sub>Ed</sub> (design normal force)</td>
                    <td>{fkN(checkResult.NEd)} {forceUnit}</td>
                  </tr>
                  <tr>
                    <td>{'\u03B4'}<sub>max</sub> (maximum deflection)</td>
                    <td>{fix(beamData.maxDeflection * 1000, 2)} {lengthUnit === 'm' ? 'mm' : lengthUnit}</td>
                  </tr>
                  <tr>
                    <td>L (beam span)</td>
                    <td>{fix(beamData.length, 3)} {lengthUnit === 'mm' ? 'm' : lengthUnit}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Section C: Unity checks with formulas ────────── */}
              <div className="scr-section-heading">C. Unity Checks</div>

              {/* C1 — Bending */}
              <CheckCard
                title="C1. Bending Check"
                reference="{'\u00A7'}6.2.5"
                uc={checkResult.UC_M}
              >
                <div className="scr-formula-block">
                  <span className="fm-label">{'// Bending resistance (elastic section modulus)'}</span>{'\n'}
                  {'M'}<sub>{'c,Rd'}</sub>{' = W'}<sub>{'el,y'}</sub>{' \u00D7 f'}<sub>{'y'}</sub>{' / \u03B3'}<sub>{'M0'}</sub>{'\n'}
                  {'M'}<sub>{'c,Rd'}</sub>{' = '}<span className="fm-value">{eng(calcData.Wy)}</span>{' \u00D7 '}<span className="fm-value">{fMPa(calcData.fy)}</span>{'\u00D710\u2076 / '}<span className="fm-value">{fix(calcData.gammaM0)}</span>{'\n'}
                  {'M'}<sub>{'c,Rd'}</sub>{' = '}<span className="fm-value">{fkNm(calcData.McRd)}</span>{` ${momentUnit}`}{'\n\n'}
                  <span className="fm-label">{'// Unity check'}</span>{'\n'}
                  {'UC = M'}<sub>{'Ed'}</sub>{' / M'}<sub>{'c,Rd'}</sub>{' = '}<span className="fm-value">{fkNm(checkResult.MEd)}</span>{' / '}<span className="fm-value">{fkNm(calcData.McRd)}</span>{' = '}
                  <span className={`fm-result ${ucColorClass(checkResult.UC_M)}`}>{fix(checkResult.UC_M, 3)}</span>
                </div>
              </CheckCard>

              {/* C2 — Shear */}
              <CheckCard
                title="C2. Shear Check"
                reference="{'\u00A7'}6.2.6"
                uc={checkResult.UC_V}
              >
                <div className="scr-formula-block">
                  <span className="fm-label">{'// Shear area'}</span>{'\n'}
                  {'A'}<sub>{'v'}</sub>{' = '}<span className="fm-value">{areaUnit === 'm²' ? eng(calcData.Av) : convertArea(calcData.Av, areaUnit).toFixed(0)}</span>{` ${areaUnit}`}
                  {(calcData.tw != null) && (<>{' (h'}<sub>{'w'}</sub>{'\u00D7t'}<sub>{'w'}</sub>{' approximation for I-sections)'}</>)}{'\n\n'}
                  <span className="fm-label">{'// Shear resistance'}</span>{'\n'}
                  {'V'}<sub>{'pl,Rd'}</sub>{' = A'}<sub>{'v'}</sub>{' \u00D7 (f'}<sub>{'y'}</sub>{' / \u221A3) / \u03B3'}<sub>{'M0'}</sub>{'\n'}
                  {'V'}<sub>{'pl,Rd'}</sub>{' = '}<span className="fm-value">{areaUnit === 'm²' ? eng(calcData.Av) : convertArea(calcData.Av, areaUnit).toFixed(0)}</span>{` ${areaUnit}`}{' \u00D7 ('}<span className="fm-value">{fMPa(calcData.fy)}</span>{` ${stressUnit}`}{' / \u221A3) / '}<span className="fm-value">{fix(calcData.gammaM0)}</span>{'\n'}
                  {'V'}<sub>{'pl,Rd'}</sub>{' = '}<span className="fm-value">{fkN(calcData.VcRd)}</span>{` ${forceUnit}`}{'\n\n'}
                  <span className="fm-label">{'// Unity check'}</span>{'\n'}
                  {'UC = V'}<sub>{'Ed'}</sub>{' / V'}<sub>{'pl,Rd'}</sub>{' = '}<span className="fm-value">{fkN(checkResult.VEd)}</span>{' / '}<span className="fm-value">{fkN(calcData.VcRd)}</span>{' = '}
                  <span className={`fm-result ${ucColorClass(checkResult.UC_V)}`}>{fix(checkResult.UC_V, 3)}</span>
                </div>
              </CheckCard>

              {/* C3 — Normal force */}
              <CheckCard
                title="C3. Normal Force Check"
                reference="{'\u00A7'}6.2.4"
                uc={checkResult.UC_N}
              >
                <div className="scr-formula-block">
                  <span className="fm-label">{'// Plastic axial resistance'}</span>{'\n'}
                  {'N'}<sub>{'pl,Rd'}</sub>{' = A \u00D7 f'}<sub>{'y'}</sub>{' / \u03B3'}<sub>{'M0'}</sub>{'\n'}
                  {'N'}<sub>{'pl,Rd'}</sub>{' = '}<span className="fm-value">{eng(calcData.A)}</span>{' \u00D7 '}<span className="fm-value">{fMPa(calcData.fy)}</span>{'\u00D710\u2076 / '}<span className="fm-value">{fix(calcData.gammaM0)}</span>{'\n'}
                  {'N'}<sub>{'pl,Rd'}</sub>{' = '}<span className="fm-value">{fkN(calcData.NplRd)}</span>{` ${forceUnit}`}{'\n\n'}
                  <span className="fm-label">{'// Unity check'}</span>{'\n'}
                  {'UC = N'}<sub>{'Ed'}</sub>{' / N'}<sub>{'pl,Rd'}</sub>{' = '}<span className="fm-value">{fkN(checkResult.NEd)}</span>{' / '}<span className="fm-value">{fkN(calcData.NplRd)}</span>{' = '}
                  <span className={`fm-result ${ucColorClass(checkResult.UC_N)}`}>{fix(checkResult.UC_N, 3)}</span>
                </div>
              </CheckCard>

              {/* C4 — Lateral torsional buckling */}
              <CheckCard
                title="C4. Lateral Torsional Buckling"
                reference="{'\u00A7'}6.3.2"
                uc={checkResult.UC_LTB}
                notApplicable={!calcData.ltb}
              >
                {calcData.ltb ? (
                  <div className="scr-formula-block">
                    <span className="fm-label">{'// Elastic critical moment for LTB'}</span>{'\n'}
                    {'M'}<sub>{'cr'}</sub>{' = C'}<sub>{'1'}</sub>{' \u00D7 (\u03C0\u00B2EI'}<sub>{'z'}</sub>{'/L\u00B2) \u00D7 \u221A(I'}<sub>{'w'}</sub>{'/I'}<sub>{'z'}</sub>{' + L\u00B2GI'}<sub>{'t'}</sub>{'/(\u03C0\u00B2EI'}<sub>{'z'}</sub>{'))'}{'\n'}
                    {'C'}<sub>{'1'}</sub>{' = '}<span className="fm-value">{fix(calcData.ltb.C1)}</span>{'\n'}
                    {'M'}<sub>{'cr'}</sub>{' = '}<span className="fm-value">{fkNm(calcData.ltb.Mcr)}</span>{` ${momentUnit}`}{'\n\n'}
                    <span className="fm-label">{'// Non-dimensional slenderness'}</span>{'\n'}
                    {'\u03BB\u0304'}<sub>{'LT'}</sub>{' = \u221A(W'}<sub>{'el,y'}</sub>{' \u00D7 f'}<sub>{'y'}</sub>{' / M'}<sub>{'cr'}</sub>{')'}{'\n'}
                    {'\u03BB\u0304'}<sub>{'LT'}</sub>{' = '}<span className="fm-value">{fix(calcData.ltb.lambdaLT, 3)}</span>{'\n\n'}
                    <span className="fm-label">{'// Buckling curve: '}{calcData.ltb.curve}{' (\u03B1'}<sub>{'LT'}</sub>{' = '}{fix(calcData.ltb.alphaLT, 2)}{')'}</span>{'\n'}
                    {'\u03A6'}<sub>{'LT'}</sub>{' = 0.5 \u00D7 [1 + \u03B1'}<sub>{'LT'}</sub>{'(\u03BB\u0304'}<sub>{'LT'}</sub>{' \u2212 0.2) + \u03BB\u0304'}<sub>{'LT'}</sub>{'\u00B2]'}{'\n'}
                    {'\u03A6'}<sub>{'LT'}</sub>{' = '}<span className="fm-value">{fix(calcData.ltb.phiLT, 4)}</span>{'\n\n'}
                    {'\u03C7'}<sub>{'LT'}</sub>{' = 1 / [\u03A6'}<sub>{'LT'}</sub>{' + \u221A(\u03A6'}<sub>{'LT'}</sub>{'\u00B2 \u2212 \u03BB\u0304'}<sub>{'LT'}</sub>{'\u00B2)]'}{'\n'}
                    {'\u03C7'}<sub>{'LT'}</sub>{' = '}<span className="fm-value">{fix(calcData.ltb.chiLT, 4)}</span>{'\n\n'}
                    <span className="fm-label">{'// LTB resistance'}</span>{'\n'}
                    {'M'}<sub>{'b,Rd'}</sub>{' = \u03C7'}<sub>{'LT'}</sub>{' \u00D7 W'}<sub>{'el,y'}</sub>{' \u00D7 f'}<sub>{'y'}</sub>{' / \u03B3'}<sub>{'M1'}</sub>{'\n'}
                    {'M'}<sub>{'b,Rd'}</sub>{' = '}<span className="fm-value">{fix(calcData.ltb.chiLT, 4)}</span>{' \u00D7 '}<span className="fm-value">{eng(calcData.Wy)}</span>{' \u00D7 '}<span className="fm-value">{fMPa(calcData.fy)}</span>{'\u00D710\u2076 / '}<span className="fm-value">{fix(calcData.gammaM1)}</span>{'\n'}
                    {'M'}<sub>{'b,Rd'}</sub>{' = '}<span className="fm-value">{fkNm(calcData.ltb.MbRd)}</span>{` ${momentUnit}`}{'\n\n'}
                    <span className="fm-label">{'// Unity check'}</span>{'\n'}
                    {'UC = M'}<sub>{'Ed'}</sub>{' / M'}<sub>{'b,Rd'}</sub>{' = '}<span className="fm-value">{fkNm(checkResult.MEd)}</span>{' / '}<span className="fm-value">{fkNm(calcData.ltb.MbRd)}</span>{' = '}
                    <span className={`fm-result ${ucColorClass(checkResult.UC_LTB)}`}>{fix(checkResult.UC_LTB, 3)}</span>
                  </div>
                ) : (
                  <div className="scr-formula-block">
                    <span className="fm-label">{'// Insufficient section data for LTB check (Iz, It, or Iw not available)'}</span>
                  </div>
                )}
              </CheckCard>

              {/* C5 — Flexural buckling */}
              <CheckCard
                title="C5. Flexural Buckling"
                reference="{'\u00A7'}6.3.1"
                uc={checkResult.UC_buckling}
                notApplicable={!calcData.buckling || checkResult.NEd <= 0}
              >
                {calcData.buckling && checkResult.NEd > 0 ? (
                  <div className="scr-formula-block">
                    <span className="fm-label">{'// Euler critical force (strong axis)'}</span>{'\n'}
                    {'N'}<sub>{'cr'}</sub>{' = \u03C0\u00B2EI'}<sub>{'y'}</sub>{' / L'}<sub>{'cr'}</sub>{'\u00B2'}{'\n'}
                    {'N'}<sub>{'cr'}</sub>{' = \u03C0\u00B2 \u00D7 210000 \u00D7 '}<span className="fm-value">{eng(calcData.Iy)}</span>{' / '}<span className="fm-value">{fix(beamData.length, 3)}</span>{'\u00B2'}{'\n'}
                    {'N'}<sub>{'cr'}</sub>{' = '}<span className="fm-value">{fkN(calcData.buckling.Ncr)}</span>{` ${forceUnit}`}{'\n\n'}
                    <span className="fm-label">{'// Non-dimensional slenderness'}</span>{'\n'}
                    {'\u03BB\u0304 = \u221A(A \u00D7 f'}<sub>{'y'}</sub>{' / N'}<sub>{'cr'}</sub>{')'}{'\n'}
                    {'\u03BB\u0304 = '}<span className="fm-value">{fix(calcData.buckling.lambda, 3)}</span>{'\n\n'}
                    <span className="fm-label">{'// Buckling curve: '}{calcData.buckling.curve}{' (\u03B1 = '}{fix(calcData.buckling.alpha, 2)}{')'}</span>{'\n'}
                    {'\u03A6 = 0.5 \u00D7 [1 + \u03B1(\u03BB\u0304 \u2212 0.2) + \u03BB\u0304\u00B2]'}{'\n'}
                    {'\u03A6 = '}<span className="fm-value">{fix(calcData.buckling.phi, 4)}</span>{'\n\n'}
                    {'\u03C7 = 1 / [\u03A6 + \u221A(\u03A6\u00B2 \u2212 \u03BB\u0304\u00B2)]'}{'\n'}
                    {'\u03C7 = '}<span className="fm-value">{fix(calcData.buckling.chi, 4)}</span>{'\n\n'}
                    <span className="fm-label">{'// Buckling resistance'}</span>{'\n'}
                    {'N'}<sub>{'b,Rd'}</sub>{' = \u03C7 \u00D7 A \u00D7 f'}<sub>{'y'}</sub>{' / \u03B3'}<sub>{'M1'}</sub>{'\n'}
                    {'N'}<sub>{'b,Rd'}</sub>{' = '}<span className="fm-value">{fix(calcData.buckling.chi, 4)}</span>{' \u00D7 '}<span className="fm-value">{eng(calcData.A)}</span>{' \u00D7 '}<span className="fm-value">{fMPa(calcData.fy)}</span>{'\u00D710\u2076 / '}<span className="fm-value">{fix(calcData.gammaM1)}</span>{'\n'}
                    {'N'}<sub>{'b,Rd'}</sub>{' = '}<span className="fm-value">{fkN(calcData.buckling.NbRd)}</span>{` ${forceUnit}`}{'\n\n'}
                    <span className="fm-label">{'// Unity check'}</span>{'\n'}
                    {'UC = N'}<sub>{'Ed'}</sub>{' / N'}<sub>{'b,Rd'}</sub>{' = '}<span className="fm-value">{fkN(checkResult.NEd)}</span>{' / '}<span className="fm-value">{fkN(calcData.buckling.NbRd)}</span>{' = '}
                    <span className={`fm-result ${ucColorClass(checkResult.UC_buckling)}`}>{fix(checkResult.UC_buckling, 3)}</span>
                  </div>
                ) : (
                  <div className="scr-formula-block">
                    <span className="fm-label">{'// No compression force or beam length = 0: flexural buckling check not applicable'}</span>
                  </div>
                )}
              </CheckCard>

              {/* C6 — Deflection */}
              <CheckCard
                title="C6. Deflection Check"
                reference="SLS"
                uc={checkResult.UC_deflection}
                notApplicable={!calcData.deflection}
              >
                {calcData.deflection ? (
                  <div className="scr-formula-block">
                    <span className="fm-label">{'// Deflection limit'}</span>{'\n'}
                    {'\u03B4'}<sub>{'lim'}</sub>{' = L / '}<span className="fm-value">{deflLimitDivisor}</span>{'\n'}
                    {'\u03B4'}<sub>{'lim'}</sub>{' = '}<span className="fm-value">{fix(beamData.length, 3)}</span>{' / '}<span className="fm-value">{deflLimitDivisor}</span>{' = '}<span className="fm-value">{fix(calcData.deflection.limit * 1000, 2)}</span>{` ${lengthUnit === 'm' ? 'mm' : lengthUnit}`}{'\n\n'}
                    <span className="fm-label">{'// Actual deflection'}</span>{'\n'}
                    {'\u03B4'}<sub>{'max'}</sub>{' = '}<span className="fm-value">{fix(calcData.deflection.actual * 1000, 2)}</span>{` ${lengthUnit === 'm' ? 'mm' : lengthUnit}`}{'\n\n'}
                    <span className="fm-label">{'// Unity check'}</span>{'\n'}
                    {'UC = \u03B4'}<sub>{'max'}</sub>{' / \u03B4'}<sub>{'lim'}</sub>{' = '}<span className="fm-value">{fix(calcData.deflection.actual * 1000, 2)}</span>{' / '}<span className="fm-value">{fix(calcData.deflection.limit * 1000, 2)}</span>{' = '}
                    <span className={`fm-result ${ucColorClass(checkResult.UC_deflection)}`}>{fix(checkResult.UC_deflection, 3)}</span>
                  </div>
                ) : (
                  <div className="scr-formula-block">
                    <span className="fm-label">{'// No deflection data available (beam length = 0 or no deflection computed)'}</span>
                  </div>
                )}
              </CheckCard>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="scr-footer">
          <span className="scr-footer-info">
            NEN-NEN-EN 1993-1-1 | Dutch National Annex | {'\u03B3'}M0 = {fix(grade.gammaM0)} | {'\u03B3'}M1 = {fix(grade.gammaM1)}
          </span>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  CheckCard sub-component                                     */
/* ──────────────────────────────────────────────────────────── */

interface CheckCardProps {
  title: string;
  reference: string;
  uc: number;
  notApplicable?: boolean;
  children: React.ReactNode;
}

function CheckCard({ title, reference, uc, notApplicable, children }: CheckCardProps) {
  const colorCls = notApplicable ? '' : ucColorClass(uc);

  return (
    <div className="scr-check-card">
      <div className="scr-check-card-header">
        <div>
          <span className="scr-check-card-title">{title}</span>
          {' '}
          <span className="scr-check-card-ref">{reference}</span>
        </div>
        <span className={`scr-check-card-uc ${colorCls}`}>
          {notApplicable ? 'N/A' : `UC = ${fix(uc, 3)}`}
        </span>
      </div>
      {/* UC bar */}
      {!notApplicable && uc > 0 && (
        <div className="scr-uc-bar-wrap">
          <div className="scr-uc-bar-track">
            <div
              className="scr-uc-bar-fill"
              style={{
                width: `${Math.min(uc * 100, 100)}%`,
                background: uc < 0.7 ? '#4ade80' : uc <= 1.0 ? '#fbbf24' : '#f87171',
              }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
