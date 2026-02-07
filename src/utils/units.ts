/**
 * Unit conversion and formatting utilities for FEM values.
 * All internal calculations use SI base units (N, m, Pa, etc.)
 */

// ============================================================================
// Unit Type Definitions
// ============================================================================

/** Force units */
export type ForceUnit = 'N' | 'kN' | 'MN';

/** Length units */
export type LengthUnit = 'm' | 'cm' | 'mm';

/** Displacement units */
export type DisplacementUnit = 'mm' | 'm';

/** Stress units */
export type StressUnit = 'Pa' | 'kPa' | 'MPa' | 'N/mm²';

/** Moment of inertia units */
export type MomentOfInertiaUnit = 'mm⁴' | 'cm⁴' | 'm⁴';

/** Section modulus units */
export type SectionModulusUnit = 'mm³' | 'cm³' | 'm³';

/** Area units */
export type AreaUnit = 'mm²' | 'cm²' | 'm²';

/** Moment (bending) units */
export type MomentUnit = 'Nm' | 'kNm';

/** Distributed load units */
export type DistributedLoadUnit = 'N/m' | 'kN/m';

/** Plate bending moment units */
export type PlateBendingMomentUnit = 'Nm/m' | 'kNm/m';

/** Plate shear force units */
export type PlateShearForceUnit = 'N/m' | 'kN/m';

/** Plate membrane force units */
export type PlateMembraneForceUnit = 'N/m' | 'kN/m';

/** All unit type keys matching FEMContext state */
export type UnitTypeKey =
  | 'force'
  | 'length'
  | 'displacement'
  | 'stress'
  | 'momentOfInertia'
  | 'sectionModulus'
  | 'area'
  | 'moment'
  | 'distributedLoad'
  | 'plateBendingMoment'
  | 'plateShearForce'
  | 'plateMembraneForce';

/** Unit state from FEMContext (subset of relevant fields) */
export interface UnitState {
  forceUnit: ForceUnit;
  lengthUnit: LengthUnit;
  displacementUnit: DisplacementUnit;
  stressUnit: StressUnit;
  momentOfInertiaUnit: MomentOfInertiaUnit;
  sectionModulusUnit: SectionModulusUnit;
  areaUnit: AreaUnit;
  momentUnit: MomentUnit;
  distributedLoadUnit: DistributedLoadUnit;
  plateBendingMomentUnit: PlateBendingMomentUnit;
  plateShearForceUnit: PlateShearForceUnit;
  plateMembraneForceUnit: PlateMembraneForceUnit;
}

// ============================================================================
// Conversion Factors (from SI base units)
// ============================================================================

/** Conversion factors FROM SI base units TO display units */
const FORCE_FACTORS: Record<ForceUnit, number> = {
  'N': 1,
  'kN': 1e-3,
  'MN': 1e-6,
};

const LENGTH_FACTORS: Record<LengthUnit, number> = {
  'm': 1,
  'cm': 100,
  'mm': 1000,
};

const DISPLACEMENT_FACTORS: Record<DisplacementUnit, number> = {
  'm': 1,
  'mm': 1000,
};

// Stress: SI base is Pa
const STRESS_FACTORS: Record<StressUnit, number> = {
  'Pa': 1,
  'kPa': 1e-3,
  'MPa': 1e-6,
  'N/mm²': 1e-6, // 1 MPa = 1 N/mm²
};

// Moment of inertia: SI base is m⁴
const MOMENT_OF_INERTIA_FACTORS: Record<MomentOfInertiaUnit, number> = {
  'm⁴': 1,
  'cm⁴': 1e8,    // 1 m⁴ = 10^8 cm⁴
  'mm⁴': 1e12,   // 1 m⁴ = 10^12 mm⁴
};

// Section modulus: SI base is m³
const SECTION_MODULUS_FACTORS: Record<SectionModulusUnit, number> = {
  'm³': 1,
  'cm³': 1e6,    // 1 m³ = 10^6 cm³
  'mm³': 1e9,    // 1 m³ = 10^9 mm³
};

// Area: SI base is m²
const AREA_FACTORS: Record<AreaUnit, number> = {
  'm²': 1,
  'cm²': 1e4,    // 1 m² = 10^4 cm²
  'mm²': 1e6,    // 1 m² = 10^6 mm²
};

// Moment (bending): SI base is Nm
const MOMENT_FACTORS: Record<MomentUnit, number> = {
  'Nm': 1,
  'kNm': 1e-3,
};

// Distributed load: SI base is N/m
const DISTRIBUTED_LOAD_FACTORS: Record<DistributedLoadUnit, number> = {
  'N/m': 1,
  'kN/m': 1e-3,
};

// Plate bending moment: SI base is Nm/m
const PLATE_BENDING_MOMENT_FACTORS: Record<PlateBendingMomentUnit, number> = {
  'Nm/m': 1,
  'kNm/m': 1e-3,
};

// Plate shear force: SI base is N/m
const PLATE_SHEAR_FORCE_FACTORS: Record<PlateShearForceUnit, number> = {
  'N/m': 1,
  'kN/m': 1e-3,
};

// Plate membrane force: SI base is N/m
const PLATE_MEMBRANE_FORCE_FACTORS: Record<PlateMembraneForceUnit, number> = {
  'N/m': 1,
  'kN/m': 1e-3,
};

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert a force value from SI (N) to the specified unit.
 */
export function convertForce(valueInNewtons: number, toUnit: ForceUnit): number {
  return valueInNewtons * FORCE_FACTORS[toUnit];
}

/**
 * Convert a force value from a specified unit to SI (N).
 */
export function convertForceToSI(value: number, fromUnit: ForceUnit): number {
  return value / FORCE_FACTORS[fromUnit];
}

/**
 * Convert a length value from SI (m) to the specified unit.
 */
export function convertLength(valueInMeters: number, toUnit: LengthUnit): number {
  return valueInMeters * LENGTH_FACTORS[toUnit];
}

/**
 * Convert a length value from a specified unit to SI (m).
 */
export function convertLengthToSI(value: number, fromUnit: LengthUnit): number {
  return value / LENGTH_FACTORS[fromUnit];
}

/**
 * Convert a displacement value from SI (m) to the specified unit.
 */
export function convertDisplacement(valueInMeters: number, toUnit: DisplacementUnit): number {
  return valueInMeters * DISPLACEMENT_FACTORS[toUnit];
}

/**
 * Convert a displacement value from a specified unit to SI (m).
 */
export function convertDisplacementToSI(value: number, fromUnit: DisplacementUnit): number {
  return value / DISPLACEMENT_FACTORS[fromUnit];
}

/**
 * Convert a stress value from SI (Pa) to the specified unit.
 */
export function convertStress(valueInPascals: number, toUnit: StressUnit): number {
  return valueInPascals * STRESS_FACTORS[toUnit];
}

/**
 * Convert a stress value from a specified unit to SI (Pa).
 */
export function convertStressToSI(value: number, fromUnit: StressUnit): number {
  return value / STRESS_FACTORS[fromUnit];
}

/**
 * Convert a moment of inertia value from SI (m⁴) to the specified unit.
 */
export function convertMomentOfInertia(valueInM4: number, toUnit: MomentOfInertiaUnit): number {
  return valueInM4 * MOMENT_OF_INERTIA_FACTORS[toUnit];
}

/**
 * Convert a moment of inertia value from a specified unit to SI (m⁴).
 */
export function convertMomentOfInertiaToSI(value: number, fromUnit: MomentOfInertiaUnit): number {
  return value / MOMENT_OF_INERTIA_FACTORS[fromUnit];
}

/**
 * Convert a section modulus value from SI (m³) to the specified unit.
 */
export function convertSectionModulus(valueInM3: number, toUnit: SectionModulusUnit): number {
  return valueInM3 * SECTION_MODULUS_FACTORS[toUnit];
}

/**
 * Convert a section modulus value from a specified unit to SI (m³).
 */
export function convertSectionModulusToSI(value: number, fromUnit: SectionModulusUnit): number {
  return value / SECTION_MODULUS_FACTORS[fromUnit];
}

/**
 * Convert an area value from SI (m²) to the specified unit.
 */
export function convertArea(valueInM2: number, toUnit: AreaUnit): number {
  return valueInM2 * AREA_FACTORS[toUnit];
}

/**
 * Convert an area value from a specified unit to SI (m²).
 */
export function convertAreaToSI(value: number, fromUnit: AreaUnit): number {
  return value / AREA_FACTORS[fromUnit];
}

/**
 * Convert a moment (bending) value from SI (Nm) to the specified unit.
 */
export function convertMoment(valueInNm: number, toUnit: MomentUnit): number {
  return valueInNm * MOMENT_FACTORS[toUnit];
}

/**
 * Convert a moment (bending) value from a specified unit to SI (Nm).
 */
export function convertMomentToSI(value: number, fromUnit: MomentUnit): number {
  return value / MOMENT_FACTORS[fromUnit];
}

/**
 * Convert a distributed load value from SI (N/m) to the specified unit.
 */
export function convertDistributedLoad(valueInNperM: number, toUnit: DistributedLoadUnit): number {
  return valueInNperM * DISTRIBUTED_LOAD_FACTORS[toUnit];
}

/**
 * Convert a distributed load value from a specified unit to SI (N/m).
 */
export function convertDistributedLoadToSI(value: number, fromUnit: DistributedLoadUnit): number {
  return value / DISTRIBUTED_LOAD_FACTORS[fromUnit];
}

/**
 * Convert a plate bending moment value from SI (Nm/m) to the specified unit.
 */
export function convertPlateBendingMoment(valueInNmPerM: number, toUnit: PlateBendingMomentUnit): number {
  return valueInNmPerM * PLATE_BENDING_MOMENT_FACTORS[toUnit];
}

/**
 * Convert a plate bending moment value from a specified unit to SI (Nm/m).
 */
export function convertPlateBendingMomentToSI(value: number, fromUnit: PlateBendingMomentUnit): number {
  return value / PLATE_BENDING_MOMENT_FACTORS[fromUnit];
}

/**
 * Convert a plate shear force value from SI (N/m) to the specified unit.
 */
export function convertPlateShearForce(valueInNperM: number, toUnit: PlateShearForceUnit): number {
  return valueInNperM * PLATE_SHEAR_FORCE_FACTORS[toUnit];
}

/**
 * Convert a plate shear force value from a specified unit to SI (N/m).
 */
export function convertPlateShearForceToSI(value: number, fromUnit: PlateShearForceUnit): number {
  return value / PLATE_SHEAR_FORCE_FACTORS[fromUnit];
}

/**
 * Convert a plate membrane force value from SI (N/m) to the specified unit.
 */
export function convertPlateMembraneForce(valueInNperM: number, toUnit: PlateMembraneForceUnit): number {
  return valueInNperM * PLATE_MEMBRANE_FORCE_FACTORS[toUnit];
}

/**
 * Convert a plate membrane force value from a specified unit to SI (N/m).
 */
export function convertPlateMembraneForceToSI(value: number, fromUnit: PlateMembraneForceUnit): number {
  return value / PLATE_MEMBRANE_FORCE_FACTORS[fromUnit];
}

// ============================================================================
// Generic Conversion by Unit Type Key
// ============================================================================

/**
 * Convert a value from SI base units to the user's selected unit.
 * @param value Value in SI base units
 * @param unitType The type of unit (e.g., 'force', 'length', 'stress')
 * @param state The unit state from FEMContext
 * @returns Converted value in user's selected unit
 */
export function convertFromSI(value: number, unitType: UnitTypeKey, state: UnitState): number {
  switch (unitType) {
    case 'force':
      return convertForce(value, state.forceUnit);
    case 'length':
      return convertLength(value, state.lengthUnit);
    case 'displacement':
      return convertDisplacement(value, state.displacementUnit);
    case 'stress':
      return convertStress(value, state.stressUnit);
    case 'momentOfInertia':
      return convertMomentOfInertia(value, state.momentOfInertiaUnit);
    case 'sectionModulus':
      return convertSectionModulus(value, state.sectionModulusUnit);
    case 'area':
      return convertArea(value, state.areaUnit);
    case 'moment':
      return convertMoment(value, state.momentUnit);
    case 'distributedLoad':
      return convertDistributedLoad(value, state.distributedLoadUnit);
    case 'plateBendingMoment':
      return convertPlateBendingMoment(value, state.plateBendingMomentUnit);
    case 'plateShearForce':
      return convertPlateShearForce(value, state.plateShearForceUnit);
    case 'plateMembraneForce':
      return convertPlateMembraneForce(value, state.plateMembraneForceUnit);
    default:
      return value;
  }
}

/**
 * Convert a value from the user's selected unit to SI base units.
 * @param value Value in user's selected unit
 * @param unitType The type of unit (e.g., 'force', 'length', 'stress')
 * @param state The unit state from FEMContext
 * @returns Converted value in SI base units
 */
export function convertToSI(value: number, unitType: UnitTypeKey, state: UnitState): number {
  switch (unitType) {
    case 'force':
      return convertForceToSI(value, state.forceUnit);
    case 'length':
      return convertLengthToSI(value, state.lengthUnit);
    case 'displacement':
      return convertDisplacementToSI(value, state.displacementUnit);
    case 'stress':
      return convertStressToSI(value, state.stressUnit);
    case 'momentOfInertia':
      return convertMomentOfInertiaToSI(value, state.momentOfInertiaUnit);
    case 'sectionModulus':
      return convertSectionModulusToSI(value, state.sectionModulusUnit);
    case 'area':
      return convertAreaToSI(value, state.areaUnit);
    case 'moment':
      return convertMomentToSI(value, state.momentUnit);
    case 'distributedLoad':
      return convertDistributedLoadToSI(value, state.distributedLoadUnit);
    case 'plateBendingMoment':
      return convertPlateBendingMomentToSI(value, state.plateBendingMomentUnit);
    case 'plateShearForce':
      return convertPlateShearForceToSI(value, state.plateShearForceUnit);
    case 'plateMembraneForce':
      return convertPlateMembraneForceToSI(value, state.plateMembraneForceUnit);
    default:
      return value;
  }
}

// ============================================================================
// Unit Label Functions
// ============================================================================

/**
 * Get the unit label string for a given unit type.
 * @param unitType The type of unit (e.g., 'force', 'length', 'stress')
 * @param state The unit state from FEMContext
 * @returns The unit string (e.g., 'kN', 'mm', 'MPa')
 */
export function getUnitLabel(unitType: UnitTypeKey, state: UnitState): string {
  switch (unitType) {
    case 'force':
      return state.forceUnit;
    case 'length':
      return state.lengthUnit;
    case 'displacement':
      return state.displacementUnit;
    case 'stress':
      return state.stressUnit;
    case 'momentOfInertia':
      return state.momentOfInertiaUnit;
    case 'sectionModulus':
      return state.sectionModulusUnit;
    case 'area':
      return state.areaUnit;
    case 'moment':
      return state.momentUnit;
    case 'distributedLoad':
      return state.distributedLoadUnit;
    case 'plateBendingMoment':
      return state.plateBendingMomentUnit;
    case 'plateShearForce':
      return state.plateShearForceUnit;
    case 'plateMembraneForce':
      return state.plateMembraneForceUnit;
    default:
      return '';
  }
}

// ============================================================================
// Formatting Functions
// ============================================================================

/** Default number formatting options */
const DEFAULT_FORMAT_OPTIONS = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
};

/**
 * Format a value with the user's selected unit.
 * @param value Value in SI base units (N, m, Pa, etc.)
 * @param unitType The type of unit (e.g., 'force', 'length', 'stress')
 * @param state The unit state from FEMContext
 * @param options Optional formatting options
 * @returns Formatted string with value and unit (e.g., "12.5 kN")
 */
export function formatWithUnit(
  value: number,
  unitType: UnitTypeKey,
  state: UnitState,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showUnit?: boolean;
  }
): string {
  const {
    minimumFractionDigits = DEFAULT_FORMAT_OPTIONS.minimumFractionDigits,
    maximumFractionDigits = DEFAULT_FORMAT_OPTIONS.maximumFractionDigits,
    showUnit = true,
  } = options ?? {};

  const convertedValue = convertFromSI(value, unitType, state);
  const formattedNumber = convertedValue.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  if (!showUnit) {
    return formattedNumber;
  }

  const unit = getUnitLabel(unitType, state);
  return `${formattedNumber} ${unit}`;
}

/**
 * Format a value for display without the unit (just the number).
 * @param value Value in SI base units
 * @param unitType The type of unit
 * @param state The unit state from FEMContext
 * @param decimals Number of decimal places (default: 3)
 * @returns Formatted number string
 */
export function formatValue(
  value: number,
  unitType: UnitTypeKey,
  state: UnitState,
  decimals: number = 3
): string {
  const convertedValue = convertFromSI(value, unitType, state);
  return convertedValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a value with scientific notation for very large or small numbers.
 * @param value Value in SI base units
 * @param unitType The type of unit
 * @param state The unit state from FEMContext
 * @param threshold Use scientific notation if |value| > threshold or < 1/threshold
 * @returns Formatted string with value and unit
 */
export function formatWithUnitScientific(
  value: number,
  unitType: UnitTypeKey,
  state: UnitState,
  threshold: number = 1e6
): string {
  const convertedValue = convertFromSI(value, unitType, state);
  const absValue = Math.abs(convertedValue);
  const unit = getUnitLabel(unitType, state);

  if (absValue === 0) {
    return `0 ${unit}`;
  }

  if (absValue >= threshold || absValue < 1 / threshold) {
    return `${convertedValue.toExponential(2)} ${unit}`;
  }

  return `${convertedValue.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${unit}`;
}

// ============================================================================
// Utility for extracting UnitState from FEMContext state
// ============================================================================

/**
 * Extract the unit-related fields from FEMContext state.
 * This allows components to pass just the relevant unit state.
 * @param femState The full FEMContext state object
 * @returns UnitState object with just the unit fields
 */
export function extractUnitState(femState: {
  forceUnit: ForceUnit;
  lengthUnit: LengthUnit;
  displacementUnit: DisplacementUnit;
  stressUnit: StressUnit;
  momentOfInertiaUnit: MomentOfInertiaUnit;
  sectionModulusUnit: SectionModulusUnit;
  areaUnit: AreaUnit;
  momentUnit: MomentUnit;
  distributedLoadUnit: DistributedLoadUnit;
  plateBendingMomentUnit: PlateBendingMomentUnit;
  plateShearForceUnit: PlateShearForceUnit;
  plateMembraneForceUnit: PlateMembraneForceUnit;
}): UnitState {
  return {
    forceUnit: femState.forceUnit,
    lengthUnit: femState.lengthUnit,
    displacementUnit: femState.displacementUnit,
    stressUnit: femState.stressUnit,
    momentOfInertiaUnit: femState.momentOfInertiaUnit,
    sectionModulusUnit: femState.sectionModulusUnit,
    areaUnit: femState.areaUnit,
    momentUnit: femState.momentUnit,
    distributedLoadUnit: femState.distributedLoadUnit,
    plateBendingMomentUnit: femState.plateBendingMomentUnit,
    plateShearForceUnit: femState.plateShearForceUnit,
    plateMembraneForceUnit: femState.plateMembraneForceUnit,
  };
}
