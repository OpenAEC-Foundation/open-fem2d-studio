/**
 * MaterialLibrary.ts
 *
 * Comprehensive Eurocode NL material library data.
 * Contains typed material data for structural engineering according to
 * European standards (EN 10025, EN 338, EN 14080, EN 1992, etc.)
 *
 * All units:
 *   - Strengths / moduli: N/mm² (MPa)
 *   - Densities: kg/m³
 *   - Thermal expansion: 1/°C
 *   - Strains: permille (‰)
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Structural steel grade according to EN 10025 */
export interface SteelGrade {
  name: string;
  /** Yield strength for t <= 40 mm (N/mm²) */
  fy_t_le_40: number;
  /** Ultimate tensile strength for t <= 40 mm (N/mm²) */
  fu_t_le_40: number;
  /** Yield strength for 40 < t <= 80 mm (N/mm²) */
  fy_t_40_80: number;
  /** Ultimate tensile strength for 40 < t <= 80 mm (N/mm²) */
  fu_t_40_80: number;
  /** Modulus of elasticity (N/mm²) */
  E: number;
  /** Shear modulus (N/mm²) */
  G: number;
  /** Poisson's ratio */
  nu: number;
  /** Coefficient of thermal expansion (1/°C) */
  alpha: number;
  /** Density (kg/m³) */
  rho: number;
}

/** Reinforcement steel grade (betonstaal) */
export interface ReinforcementSteel {
  name: string;
  /** Characteristic yield strength (N/mm²) */
  fyk: number;
  /** Characteristic tensile strength (N/mm²) */
  ftk: number;
  /** Modulus of elasticity (N/mm²) */
  Es: number;
}

/** Bolt quality according to EN ISO 898-1 */
export interface BoltQuality {
  name: string;
  /** Yield strength (N/mm²) */
  fyb: number;
  /** Ultimate tensile strength (N/mm²) */
  fub: number;
}

/** Wood strength class according to EN 338 / EN 14080 */
export interface WoodStrengthClass {
  name: string;
  /** Characteristic bending strength (N/mm²) */
  fm_k: number;
  /** Characteristic tension parallel to grain (N/mm²) */
  ft_0_k: number;
  /** Characteristic tension perpendicular to grain (N/mm²) */
  ft_90_k: number;
  /** Characteristic compression parallel to grain (N/mm²) */
  fc_0_k: number;
  /** Characteristic compression perpendicular to grain (N/mm²) */
  fc_90_k: number;
  /** Characteristic shear strength (N/mm²) */
  fv_k: number;
  /** Mean modulus of elasticity parallel to grain (N/mm²) */
  E_0_mean: number;
  /** 5th percentile modulus of elasticity parallel to grain (N/mm²) */
  E_0_05: number;
  /** Mean modulus of elasticity perpendicular to grain (N/mm²) */
  E_90_mean: number;
  /** Mean shear modulus (N/mm²) */
  G_mean: number;
  /** Characteristic density (kg/m³) */
  rho_k: number;
  /** Mean density (kg/m³) */
  rho_mean: number;
}

/** Modification factor kmod for timber (EN 1995-1-1, Table 3.1) */
export interface KmodTable {
  /** Climate (service) class: 1, 2, or 3 */
  climateClass: number;
  /** Load duration class */
  loadDuration:
    | 'permanent'
    | 'long'
    | 'medium_long'
    | 'short'
    | 'momentary';
  /** Modification factor */
  kmod: number;
}

/** Creep deformation factor kdef for timber (EN 1995-1-1, Table 3.2) */
export interface KdefTable {
  /** Climate (service) class: 1, 2, or 3 */
  climateClass: number;
  /** Material type */
  materialType: 'solid_wood' | 'glulam' | 'plywood';
  /** Creep factor */
  kdef: number;
}

/** Mapping of common wood species to strength class */
export interface WoodSpecies {
  /** Dutch name */
  name: string;
  /** English name */
  nameEn: string;
  /** Strength class reference, e.g. "C24" */
  strengthClass: string;
  /** Type category */
  type: 'softwood' | 'hardwood';
}

/** Concrete grade according to EN 1992-1-1 */
export interface ConcreteGrade {
  name: string;
  /** Characteristic cylinder compressive strength (N/mm²) */
  fck: number;
  /** Characteristic cube compressive strength (N/mm²) */
  fck_cube: number;
  /** Mean cylinder compressive strength (N/mm²) */
  fcm: number;
  /** Mean axial tensile strength (N/mm²) */
  fctm: number;
  /** 5% fractile tensile strength (N/mm²) */
  fctk_005: number;
  /** 95% fractile tensile strength (N/mm²) */
  fctk_095: number;
  /** Secant modulus of elasticity (N/mm²) */
  Ecm: number;
  /** Design compressive strength fcd = acc * fck / gc (N/mm²), acc=1.0, gc=1.5 */
  fcd: number;
  /** Design tensile strength fctd = fctk,0.05 / gc (N/mm²) */
  fctd: number;
  /** Ultimate compressive strain (permille) */
  epsilon_cu3: number;
  /** Poisson's ratio */
  nu: number;
  /** Density (kg/m³) */
  rho: number;
}

/** Generic material for simplified analysis / display */
export interface GenericMaterial {
  name: string;
  /** Young's modulus (N/mm²) */
  E: number;
  /** Poisson's ratio */
  nu: number;
  /** Density (kg/m³) */
  rho: number;
  /** Coefficient of thermal expansion (1/°C) */
  alpha: number;
  /** Display colour (hex) */
  color: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// ---- Steel (Constructiestaal - EN 10025) ----------------------------------

export const STEEL_GRADES: SteelGrade[] = [
  {
    name: 'S235',
    fy_t_le_40: 235,
    fu_t_le_40: 360,
    fy_t_40_80: 215,
    fu_t_40_80: 360,
    E: 210000,
    G: 81000,
    nu: 0.3,
    alpha: 12e-6,
    rho: 7850,
  },
  {
    name: 'S275',
    fy_t_le_40: 275,
    fu_t_le_40: 430,
    fy_t_40_80: 255,
    fu_t_40_80: 410,
    E: 210000,
    G: 81000,
    nu: 0.3,
    alpha: 12e-6,
    rho: 7850,
  },
  {
    name: 'S355',
    fy_t_le_40: 355,
    fu_t_le_40: 510,
    fy_t_40_80: 335,
    fu_t_40_80: 470,
    E: 210000,
    G: 81000,
    nu: 0.3,
    alpha: 12e-6,
    rho: 7850,
  },
  {
    name: 'S450',
    fy_t_le_40: 440,
    fu_t_le_40: 550,
    fy_t_40_80: 410,
    fu_t_40_80: 550,
    E: 210000,
    G: 81000,
    nu: 0.3,
    alpha: 12e-6,
    rho: 7850,
  },
];

// ---- Reinforcement Steel (Betonstaal) -------------------------------------

export const REINFORCEMENT_STEEL: ReinforcementSteel[] = [
  { name: 'B220', fyk: 220, ftk: 340, Es: 200000 },
  { name: 'B400', fyk: 400, ftk: 460, Es: 200000 },
  { name: 'B500', fyk: 500, ftk: 550, Es: 200000 },
];

// ---- Bolt Qualities (Boutkwaliteiten) -------------------------------------

export const BOLT_QUALITIES: BoltQuality[] = [
  { name: '4.6', fyb: 240, fub: 400 },
  { name: '5.6', fyb: 300, fub: 500 },
  { name: '6.8', fyb: 480, fub: 600 },
  { name: '8.8', fyb: 640, fub: 800 },
  { name: '10.9', fyb: 900, fub: 1000 },
];

// ---- Softwood (Naaldhout - EN 338) ----------------------------------------

export const SOFTWOOD_CLASSES: WoodStrengthClass[] = [
  {
    name: 'C14',
    fm_k: 14,
    ft_0_k: 8,
    ft_90_k: 0.4,
    fc_0_k: 16,
    fc_90_k: 2.0,
    fv_k: 3.0,
    E_0_mean: 7000,
    E_0_05: 4700,
    E_90_mean: 230,
    G_mean: 440,
    rho_k: 290,
    rho_mean: 350,
  },
  {
    name: 'C16',
    fm_k: 16,
    ft_0_k: 10,
    ft_90_k: 0.4,
    fc_0_k: 17,
    fc_90_k: 2.2,
    fv_k: 3.2,
    E_0_mean: 8000,
    E_0_05: 5400,
    E_90_mean: 270,
    G_mean: 500,
    rho_k: 310,
    rho_mean: 370,
  },
  {
    name: 'C18',
    fm_k: 18,
    ft_0_k: 11,
    ft_90_k: 0.4,
    fc_0_k: 18,
    fc_90_k: 2.2,
    fv_k: 3.4,
    E_0_mean: 9000,
    E_0_05: 6000,
    E_90_mean: 300,
    G_mean: 560,
    rho_k: 320,
    rho_mean: 380,
  },
  {
    name: 'C20',
    fm_k: 20,
    ft_0_k: 12,
    ft_90_k: 0.5,
    fc_0_k: 19,
    fc_90_k: 2.3,
    fv_k: 3.6,
    E_0_mean: 9500,
    E_0_05: 6400,
    E_90_mean: 320,
    G_mean: 590,
    rho_k: 330,
    rho_mean: 390,
  },
  {
    name: 'C22',
    fm_k: 22,
    ft_0_k: 13,
    ft_90_k: 0.5,
    fc_0_k: 20,
    fc_90_k: 2.4,
    fv_k: 3.8,
    E_0_mean: 10000,
    E_0_05: 6700,
    E_90_mean: 330,
    G_mean: 630,
    rho_k: 340,
    rho_mean: 410,
  },
  {
    name: 'C24',
    fm_k: 24,
    ft_0_k: 14,
    ft_90_k: 0.5,
    fc_0_k: 21,
    fc_90_k: 2.5,
    fv_k: 4.0,
    E_0_mean: 11000,
    E_0_05: 7400,
    E_90_mean: 370,
    G_mean: 690,
    rho_k: 350,
    rho_mean: 420,
  },
  {
    name: 'C27',
    fm_k: 27,
    ft_0_k: 16,
    ft_90_k: 0.5,
    fc_0_k: 22,
    fc_90_k: 2.6,
    fv_k: 4.0,
    E_0_mean: 11500,
    E_0_05: 7700,
    E_90_mean: 380,
    G_mean: 720,
    rho_k: 370,
    rho_mean: 450,
  },
  {
    name: 'C30',
    fm_k: 30,
    ft_0_k: 18,
    ft_90_k: 0.5,
    fc_0_k: 23,
    fc_90_k: 2.7,
    fv_k: 4.0,
    E_0_mean: 12000,
    E_0_05: 8000,
    E_90_mean: 400,
    G_mean: 750,
    rho_k: 380,
    rho_mean: 460,
  },
  {
    name: 'C35',
    fm_k: 35,
    ft_0_k: 21,
    ft_90_k: 0.5,
    fc_0_k: 25,
    fc_90_k: 2.8,
    fv_k: 4.0,
    E_0_mean: 13000,
    E_0_05: 8700,
    E_90_mean: 430,
    G_mean: 810,
    rho_k: 400,
    rho_mean: 480,
  },
];

// ---- Hardwood (Loofhout - EN 338) -----------------------------------------

export const HARDWOOD_CLASSES: WoodStrengthClass[] = [
  {
    name: 'D30',
    fm_k: 30,
    ft_0_k: 18,
    ft_90_k: 0.6,
    fc_0_k: 23,
    fc_90_k: 8.0,
    fv_k: 3.0,
    E_0_mean: 10000,
    E_0_05: 8000,
    E_90_mean: 640,
    G_mean: 600,
    rho_k: 530,
    rho_mean: 640,
  },
  {
    name: 'D35',
    fm_k: 35,
    ft_0_k: 21,
    ft_90_k: 0.6,
    fc_0_k: 25,
    fc_90_k: 8.4,
    fv_k: 3.4,
    E_0_mean: 10000,
    E_0_05: 8700,
    E_90_mean: 690,
    G_mean: 650,
    rho_k: 560,
    rho_mean: 670,
  },
  {
    name: 'D40',
    fm_k: 40,
    ft_0_k: 24,
    ft_90_k: 0.6,
    fc_0_k: 26,
    fc_90_k: 8.8,
    fv_k: 3.8,
    E_0_mean: 11000,
    E_0_05: 9400,
    E_90_mean: 750,
    G_mean: 700,
    rho_k: 590,
    rho_mean: 700,
  },
  {
    name: 'D50',
    fm_k: 50,
    ft_0_k: 30,
    ft_90_k: 0.6,
    fc_0_k: 29,
    fc_90_k: 9.7,
    fv_k: 4.6,
    E_0_mean: 14000,
    E_0_05: 11800,
    E_90_mean: 930,
    G_mean: 880,
    rho_k: 650,
    rho_mean: 780,
  },
  {
    name: 'D60',
    fm_k: 60,
    ft_0_k: 36,
    ft_90_k: 0.6,
    fc_0_k: 32,
    fc_90_k: 10.5,
    fv_k: 5.3,
    E_0_mean: 17000,
    E_0_05: 14300,
    E_90_mean: 1130,
    G_mean: 1060,
    rho_k: 700,
    rho_mean: 840,
  },
  {
    name: 'D70',
    fm_k: 70,
    ft_0_k: 42,
    ft_90_k: 0.6,
    fc_0_k: 34,
    fc_90_k: 13.5,
    fv_k: 6.0,
    E_0_mean: 20000,
    E_0_05: 16800,
    E_90_mean: 1330,
    G_mean: 1250,
    rho_k: 900,
    rho_mean: 1080,
  },
];

// ---- Glulam (Gelamineerd hout - EN 14080) ---------------------------------

export const GLULAM_CLASSES: WoodStrengthClass[] = [
  {
    name: 'GL24h',
    fm_k: 24,
    ft_0_k: 19.2,
    ft_90_k: 0.5,
    fc_0_k: 24,
    fc_90_k: 2.5,
    fv_k: 3.5,
    E_0_mean: 11500,
    E_0_05: 9600,
    E_90_mean: 300,
    G_mean: 650,
    rho_k: 385,
    rho_mean: 420,
  },
  {
    name: 'GL28h',
    fm_k: 28,
    ft_0_k: 22.3,
    ft_90_k: 0.5,
    fc_0_k: 26.5,
    fc_90_k: 2.5,
    fv_k: 3.5,
    E_0_mean: 12600,
    E_0_05: 10500,
    E_90_mean: 300,
    G_mean: 650,
    rho_k: 425,
    rho_mean: 460,
  },
  {
    name: 'GL32h',
    fm_k: 32,
    ft_0_k: 25.6,
    ft_90_k: 0.5,
    fc_0_k: 29,
    fc_90_k: 2.5,
    fv_k: 3.5,
    E_0_mean: 13700,
    E_0_05: 11100,
    E_90_mean: 300,
    G_mean: 650,
    rho_k: 440,
    rho_mean: 480,
  },
  {
    name: 'GL36h',
    fm_k: 36,
    ft_0_k: 28.8,
    ft_90_k: 0.5,
    fc_0_k: 31,
    fc_90_k: 2.5,
    fv_k: 3.5,
    E_0_mean: 14700,
    E_0_05: 11900,
    E_90_mean: 300,
    G_mean: 650,
    rho_k: 450,
    rho_mean: 490,
  },
];

// ---- Timber kmod factors (EN 1995-1-1, Table 3.1) -------------------------

export const KMOD_TABLE: KmodTable[] = [
  // Climate class 1
  { climateClass: 1, loadDuration: 'permanent', kmod: 0.60 },
  { climateClass: 1, loadDuration: 'long', kmod: 0.70 },
  { climateClass: 1, loadDuration: 'medium_long', kmod: 0.80 },
  { climateClass: 1, loadDuration: 'short', kmod: 0.90 },
  { climateClass: 1, loadDuration: 'momentary', kmod: 1.10 },
  // Climate class 2
  { climateClass: 2, loadDuration: 'permanent', kmod: 0.60 },
  { climateClass: 2, loadDuration: 'long', kmod: 0.70 },
  { climateClass: 2, loadDuration: 'medium_long', kmod: 0.80 },
  { climateClass: 2, loadDuration: 'short', kmod: 0.90 },
  { climateClass: 2, loadDuration: 'momentary', kmod: 1.10 },
  // Climate class 3
  { climateClass: 3, loadDuration: 'permanent', kmod: 0.50 },
  { climateClass: 3, loadDuration: 'long', kmod: 0.55 },
  { climateClass: 3, loadDuration: 'medium_long', kmod: 0.65 },
  { climateClass: 3, loadDuration: 'short', kmod: 0.70 },
  { climateClass: 3, loadDuration: 'momentary', kmod: 0.90 },
];

// ---- Timber kdef factors (EN 1995-1-1, Table 3.2) -------------------------

export const KDEF_TABLE: KdefTable[] = [
  // Solid wood
  { climateClass: 1, materialType: 'solid_wood', kdef: 0.60 },
  { climateClass: 2, materialType: 'solid_wood', kdef: 0.80 },
  { climateClass: 3, materialType: 'solid_wood', kdef: 2.00 },
  // Glulam
  { climateClass: 1, materialType: 'glulam', kdef: 0.60 },
  { climateClass: 2, materialType: 'glulam', kdef: 0.80 },
  { climateClass: 3, materialType: 'glulam', kdef: 2.00 },
  // Plywood
  { climateClass: 1, materialType: 'plywood', kdef: 0.80 },
  { climateClass: 2, materialType: 'plywood', kdef: 1.00 },
  { climateClass: 3, materialType: 'plywood', kdef: 2.50 },
];

// ---- Wood Species Mapping -------------------------------------------------

export const WOOD_SPECIES: WoodSpecies[] = [
  { name: 'Vuren', nameEn: 'Spruce', strengthClass: 'C24', type: 'softwood' },
  { name: 'Grenen', nameEn: 'Pine', strengthClass: 'C24', type: 'softwood' },
  { name: 'Douglas', nameEn: 'Douglas', strengthClass: 'C24', type: 'softwood' },
  { name: 'Lariks', nameEn: 'Larch', strengthClass: 'C30', type: 'softwood' },
  {
    name: 'Western Red Cedar',
    nameEn: 'Western Red Cedar',
    strengthClass: 'C18',
    type: 'softwood',
  },
  {
    name: 'Meranti (dark red)',
    nameEn: 'Meranti (dark red)',
    strengthClass: 'D40',
    type: 'hardwood',
  },
  { name: 'Azob\u00e9', nameEn: 'Azob\u00e9', strengthClass: 'D70', type: 'hardwood' },
  {
    name: 'Eiken Europees',
    nameEn: 'European Oak',
    strengthClass: 'D30',
    type: 'hardwood',
  },
  { name: 'Iroko', nameEn: 'Iroko', strengthClass: 'D40', type: 'hardwood' },
  { name: 'Merbau', nameEn: 'Merbau', strengthClass: 'D50', type: 'hardwood' },
];

// ---- Concrete (Beton - EN 1992-1-1) ---------------------------------------

export const CONCRETE_GRADES: ConcreteGrade[] = [
  {
    name: 'C12/15',
    fck: 12,
    fck_cube: 15,
    fcm: 20,
    fctm: 1.6,
    fctk_005: 1.1,
    fctk_095: 2.0,
    Ecm: 27000,
    fcd: 8.0,
    fctd: 0.73,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C16/20',
    fck: 16,
    fck_cube: 20,
    fcm: 24,
    fctm: 1.9,
    fctk_005: 1.3,
    fctk_095: 2.5,
    Ecm: 29000,
    fcd: 10.67,
    fctd: 0.87,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C20/25',
    fck: 20,
    fck_cube: 25,
    fcm: 28,
    fctm: 2.2,
    fctk_005: 1.5,
    fctk_095: 2.9,
    Ecm: 30000,
    fcd: 13.33,
    fctd: 1.0,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C25/30',
    fck: 25,
    fck_cube: 30,
    fcm: 33,
    fctm: 2.6,
    fctk_005: 1.8,
    fctk_095: 3.3,
    Ecm: 31000,
    fcd: 16.67,
    fctd: 1.2,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C28/35',
    fck: 28,
    fck_cube: 35,
    fcm: 36,
    fctm: 2.8,
    fctk_005: 1.9,
    fctk_095: 3.6,
    Ecm: 32000,
    fcd: 18.67,
    fctd: 1.27,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C30/37',
    fck: 30,
    fck_cube: 37,
    fcm: 38,
    fctm: 2.9,
    fctk_005: 2.0,
    fctk_095: 3.8,
    Ecm: 33000,
    fcd: 20.0,
    fctd: 1.33,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C35/45',
    fck: 35,
    fck_cube: 45,
    fcm: 43,
    fctm: 3.2,
    fctk_005: 2.2,
    fctk_095: 4.2,
    Ecm: 34000,
    fcd: 23.33,
    fctd: 1.47,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C40/50',
    fck: 40,
    fck_cube: 50,
    fcm: 48,
    fctm: 3.5,
    fctk_005: 2.5,
    fctk_095: 4.6,
    Ecm: 35000,
    fcd: 26.67,
    fctd: 1.67,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C45/55',
    fck: 45,
    fck_cube: 55,
    fcm: 53,
    fctm: 3.8,
    fctk_005: 2.7,
    fctk_095: 4.9,
    Ecm: 36000,
    fcd: 30.0,
    fctd: 1.8,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C50/60',
    fck: 50,
    fck_cube: 60,
    fcm: 58,
    fctm: 4.1,
    fctk_005: 2.9,
    fctk_095: 5.3,
    Ecm: 37000,
    fcd: 33.33,
    fctd: 1.93,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
  {
    name: 'C53/65',
    fck: 53,
    fck_cube: 65,
    fcm: 61,
    fctm: 4.2,
    fctk_005: 3.0,
    fctk_095: 5.5,
    Ecm: 38000,
    fcd: 35.33,
    fctd: 2.0,
    epsilon_cu3: 3.5,
    nu: 0.2,
    rho: 2400,
  },
];

// ---- Generic Materials ----------------------------------------------------

export const GENERIC_MATERIALS: GenericMaterial[] = [
  {
    name: 'Structural Steel',
    E: 210000,
    nu: 0.3,
    rho: 7850,
    alpha: 12e-6,
    color: '#4a90d9',
  },
  {
    name: 'Stainless Steel',
    E: 200000,
    nu: 0.3,
    rho: 7900,
    alpha: 16e-6,
    color: '#8ab4f8',
  },
  {
    name: 'Aluminium',
    E: 70000,
    nu: 0.33,
    rho: 2700,
    alpha: 23e-6,
    color: '#c0c0c0',
  },
  {
    name: 'Concrete',
    E: 30000,
    nu: 0.2,
    rho: 2400,
    alpha: 10e-6,
    color: '#808080',
  },
  {
    name: 'Timber (softwood)',
    E: 11000,
    nu: 0.35,
    rho: 420,
    alpha: 5e-6,
    color: '#d4a574',
  },
  {
    name: 'Timber (hardwood)',
    E: 14000,
    nu: 0.35,
    rho: 700,
    alpha: 5e-6,
    color: '#8b6914',
  },
  {
    name: 'Glass',
    E: 70000,
    nu: 0.22,
    rho: 2500,
    alpha: 8e-6,
    color: '#87ceeb',
  },
  {
    name: 'Masonry',
    E: 5000,
    nu: 0.15,
    rho: 1800,
    alpha: 6e-6,
    color: '#cd853f',
  },
];
