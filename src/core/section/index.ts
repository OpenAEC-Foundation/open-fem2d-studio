/**
 * Section Properties Module
 *
 * Provides cross-section property calculations for structural analysis.
 */

export {
  // Core calculation functions
  calculateSectionProperties,
  calculatePlasticModulus,
  calculateArea,
  calculateSignedArea,
  calculateCentroid,
  calculateFirstMoments,
  calculateSecondMoments,
  calculatePrincipalMoments,
  getBoundingBox,
  translatePoints,

  // Torsion properties
  calculateTorsionConstantClosed,
  calculateTorsionConstantOpen,

  // Standard profile generators
  createISection,
  createRHS,
  createCHS,
  createChannel,
  createAngle,
  createTSection,
  createRectangle,
  createCircle,

  // Types
  type Point2D,
  type Contour,
  type SectionGeometry,
  type SectionPropertiesResult,
} from './SectionProperties';

// Test utilities (for development)
export {
  runValidationTests,
  printValidationResults,
  demoSectionProperties,
} from './SectionProperties.test';
