/**
 * Section Properties Dialog
 *
 * Shows steel profile properties with SVG visualization including:
 * - Profile library selection from JSON database
 * - Fillet radii in SVG rendering
 * - Neutral axes display
 * - Profile rotation option
 * - Section properties with proper units and subscripts
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { IBeamSection } from '../../core/fem/types';
import { rectangularSection, iProfileSection, tubularSection } from '../../core/fem/Beam';
import {
  calculateSectionProperties,
  calculatePlasticModulus,
  createISection,
  createRHS,
  createCHS,
  createChannel,
  createRectangle,
  SectionGeometry,
  SectionPropertiesResult,
} from '../../core/section/SectionProperties';
import {
  ProfileGeometry,
  createIShapeParallelFlange,
  createRectangleHollowSection,
  createRoundTube,
  createCChannelParallelFlange,
  createRectangle as createRectangleProfile,
} from '../../core/section/SteelProfiles';
import { SteelProfileLibrary, ProfileEntry, ProfileCategory } from '../../core/section/SteelProfileLibrary';
import { ProfileSvgPreview, DimensionKey } from './ProfileSvgPreview';
import { useI18n } from '../../i18n/i18n';
import timberData from '../../data/timberprofile.json';
import './SectionPropertiesDialog.css';

type MaterialTab = 'steel' | 'concrete' | 'timber' | 'composite';

// Timber profile types
interface TimberProfileData {
  shape_coords: number[];
  shape_name: string;
  synonyms: string[];
  area: number;
  iy: number;
  iz: number;
  wy: number;
  wz: number;
}

interface TimberProfileEntry {
  name: string;
  data: TimberProfileData;
}

// Parse timber data from JSON
function getTimberProfiles(): TimberProfileEntry[] {
  const profiles: TimberProfileEntry[] = [];
  for (const entry of timberData as unknown as Record<string, TimberProfileData[]>[]) {
    for (const [name, dataArr] of Object.entries(entry)) {
      if (dataArr && dataArr.length > 0) {
        profiles.push({ name, data: dataArr[0] });
      }
    }
  }
  return profiles;
}

// Timber categories derived from name suffixes
type TimberCategory = 'SLS' | 'EU' | 'CLS' | 'GL';

function getTimberCategory(name: string): TimberCategory {
  if (name.endsWith(' SLS')) return 'SLS';
  if (name.endsWith(' EU')) return 'EU';
  if (name.endsWith(' CLS')) return 'CLS';
  if (name.endsWith(' GL')) return 'GL';
  return 'GL';
}

const TIMBER_CATEGORIES: TimberCategory[] = ['SLS', 'EU', 'CLS', 'GL'];

interface SectionPropertiesDialogProps {
  section?: { name: string; section: IBeamSection };
  isNew?: boolean;
  onSave?: (name: string, section: IBeamSection) => void;
  onClose: () => void;
}

type SectionType = 'library' | 'custom' | 'rectangular' | 'i-profile' | 'tube' | 'rhs' | 'channel';

export function SectionPropertiesDialog({ section, isNew, onSave, onClose }: SectionPropertiesDialogProps) {
  const { t } = useI18n();
  const initialProfileName = section?.name || 'HEA100';
  const [name, setName] = useState(initialProfileName);
  const [sectionType, setSectionType] = useState<SectionType>('library');
  const [materialTab, setMaterialTab] = useState<MaterialTab>('steel');

  // Concrete section state
  const [concreteShape, setConcreteShape] = useState<'rectangular' | 'circular'>('rectangular');
  const [concB, setConcB] = useState('300');
  const [concH, setConcH] = useState('500');
  const [concD, setConcD] = useState('400');

  // Timber state
  const allTimberProfiles = useMemo(() => getTimberProfiles(), []);
  const [timberCategory, setTimberCategory] = useState<TimberCategory>('GL');
  const [timberSearch, setTimberSearch] = useState('');
  const [selectedTimber, setSelectedTimber] = useState<TimberProfileEntry | null>(null);

  // Library selection state
  const [selectedCategory, setSelectedCategory] = useState<ProfileCategory>(() => {
    // Find the category of the current profile via its shape name
    const profile = SteelProfileLibrary.findProfile(initialProfileName);
    if (profile) {
      const cats = SteelProfileLibrary.getCategories();
      for (const cat of cats) {
        const series = SteelProfileLibrary.getSeriesByCategory(cat);
        if (series.some(s => s.profiles.some(p => p.name === profile.name))) return cat;
      }
    }
    return 'I-Profiles';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<ProfileEntry | null>(() => {
    const profile = SteelProfileLibrary.findProfile(initialProfileName);
    return profile ?? SteelProfileLibrary.findProfile('HEA100') ?? null;
  });

  // Display options
  const [showNeutralAxes, setShowNeutralAxes] = useState(true);
  const showFilletLines = false; // Hoeklijnen disabled
  const [rotation, setRotation] = useState(0); // degrees

  // Custom section properties (in mm² and mm⁴)
  const [A, setA] = useState(section ? (section.section.A * 1e6).toFixed(1) : '1000');
  const [I, setI] = useState(section ? (section.section.I * 1e12).toFixed(1) : '1000000');
  const [h, setH] = useState(section ? (section.section.h * 1000).toFixed(1) : '100');

  // Rectangular section (mm)
  const [rectB, setRectB] = useState('100');
  const [rectH, setRectH] = useState('200');

  // I-profile (mm)
  const [iH, setIH] = useState('200');
  const [iB, setIB] = useState('100');
  const [iTw, setITw] = useState('6');
  const [iTf, setITf] = useState('10');
  const [iR, setIR] = useState('12');

  // Tube (mm)
  const [tubeD, setTubeD] = useState('100');
  const [tubeT, setTubeT] = useState('5');

  // RHS (mm)
  const [rhsH, setRhsH] = useState('100');
  const [rhsB, setRhsB] = useState('50');
  const [rhsT, setRhsT] = useState('4');

  // Channel (mm)
  const [chH, setChH] = useState('200');
  const [chB, setChB] = useState('75');
  const [chTw, setChTw] = useState('8');
  const [chTf, setChTf] = useState('11');

  // Get available profiles from library
  const categories = SteelProfileLibrary.getCategories();

  const searchResults = useMemo(() => {
    if (searchQuery.length >= 2) {
      return SteelProfileLibrary.searchProfiles(searchQuery, 100);
    }
    // Return profiles from selected category
    const series = SteelProfileLibrary.getSeriesByCategory(selectedCategory);
    const profiles: ProfileEntry[] = [];
    for (const s of series) {
      profiles.push(...s.profiles);
    }
    return profiles.slice(0, 100);
  }, [searchQuery, selectedCategory]);

  // Auto-select first search result when typing
  useEffect(() => {
    if (searchQuery.length >= 2 && searchResults.length > 0) {
      setSelectedProfile(searchResults[0]);
      setName(searchResults[0].name);
    }
  }, [searchResults, searchQuery]);

  // Timber profile filtering
  const timberResults = useMemo(() => {
    if (timberSearch.length >= 2) {
      const q = timberSearch.toLowerCase();
      return allTimberProfiles.filter(p => p.name.toLowerCase().includes(q)).slice(0, 100);
    }
    return allTimberProfiles.filter(p => getTimberCategory(p.name) === timberCategory).slice(0, 100);
  }, [timberSearch, timberCategory, allTimberProfiles]);

  useEffect(() => {
    if (timberSearch.length >= 2 && timberResults.length > 0) {
      setSelectedTimber(timberResults[0]);
      setName(timberResults[0].name);
    }
  }, [timberResults, timberSearch]);

  // Live calculation of section properties
  const computedProps = useMemo((): { geom: SectionGeometry | null; props: SectionPropertiesResult | null; wplX: number; wplY: number } => {
    let geom: SectionGeometry | null = null;

    try {
      if (sectionType === 'library' && selectedProfile) {
        // Use profile from library
        const dims = SteelProfileLibrary.getBeamSection(selectedProfile);
        const shapeName = selectedProfile.data.shape_name;

        if (shapeName.includes('I-shape')) {
          geom = createISection(
            dims.h * 1000,
            dims.b * 1000,
            (dims.tw || 0.006) * 1000,
            (dims.tf || 0.01) * 1000
          );
        } else if (shapeName === 'Rectangle Hollow Section') {
          geom = createRHS(dims.h * 1000, dims.b * 1000, (dims.tw || 0.004) * 1000);
        } else if (shapeName === 'Round tube profile') {
          geom = createCHS(dims.h * 1000, (dims.tw || 0.005) * 1000);
        } else if (shapeName.includes('C-channel')) {
          geom = createChannel(
            dims.h * 1000,
            dims.b * 1000,
            (dims.tw || 0.008) * 1000,
            (dims.tf || 0.011) * 1000
          );
        } else if (shapeName === 'Rectangle') {
          geom = createRectangle(dims.h * 1000, dims.b * 1000);
        } else if (shapeName.includes('Cold-Formed') || shapeName === 'Sigma' || shapeName === 'LAngle') {
          // Use channel approximation for cold-formed C/Z/Sigma and angle profiles
          geom = createChannel(
            dims.h * 1000,
            dims.b * 1000,
            (dims.tw || 0.003) * 1000,
            (dims.tf || 0.003) * 1000
          );
        }
      } else {
        switch (sectionType) {
          case 'rectangular':
            geom = createRectangle(parseFloat(rectH) || 100, parseFloat(rectB) || 50);
            break;
          case 'i-profile':
            geom = createISection(
              parseFloat(iH) || 200,
              parseFloat(iB) || 100,
              parseFloat(iTw) || 6,
              parseFloat(iTf) || 10
            );
            break;
          case 'tube':
            geom = createCHS(parseFloat(tubeD) || 100, parseFloat(tubeT) || 5);
            break;
          case 'rhs':
            geom = createRHS(parseFloat(rhsH) || 100, parseFloat(rhsB) || 50, parseFloat(rhsT) || 4);
            break;
          case 'channel':
            geom = createChannel(
              parseFloat(chH) || 200,
              parseFloat(chB) || 75,
              parseFloat(chTw) || 8,
              parseFloat(chTf) || 11
            );
            break;
          default:
            return { geom: null, props: null, wplX: 0, wplY: 0 };
        }
      }

      if (geom) {
        const props = calculateSectionProperties(geom);
        const wplX = calculatePlasticModulus(geom, 'x');
        const wplY = calculatePlasticModulus(geom, 'y');
        return { geom, props, wplX, wplY };
      }
    } catch {
      // Invalid dimensions
    }

    return { geom: null, props: null, wplX: 0, wplY: 0 };
  }, [sectionType, selectedProfile, rectB, rectH, iH, iB, iTw, iTf, tubeD, tubeT, rhsH, rhsB, rhsT, chH, chB, chTw, chTf]);

  // SVG profile geometry with fillets
  const profileGeometry = useMemo((): ProfileGeometry | null => {
    try {
      if (sectionType === 'library' && selectedProfile) {
        return SteelProfileLibrary.createProfileGeometry(selectedProfile);
      }

      const hVal = parseFloat(sectionType === 'rectangular' ? rectH : sectionType === 'i-profile' ? iH : sectionType === 'rhs' ? rhsH : sectionType === 'channel' ? chH : tubeD) || 100;
      const bVal = parseFloat(sectionType === 'rectangular' ? rectB : sectionType === 'i-profile' ? iB : sectionType === 'rhs' ? rhsB : sectionType === 'channel' ? chB : tubeD) || 50;
      const twVal = parseFloat(sectionType === 'i-profile' ? iTw : sectionType === 'rhs' ? rhsT : sectionType === 'channel' ? chTw : tubeT) || 6;
      const tfVal = parseFloat(sectionType === 'i-profile' ? iTf : sectionType === 'channel' ? chTf : String(twVal)) || 10;
      const rVal = parseFloat(iR) || 12;

      switch (sectionType) {
        case 'rectangular':
          return createRectangleProfile('Rectangle', bVal, hVal);
        case 'i-profile':
          return createIShapeParallelFlange('I-Profile', hVal, bVal, twVal, tfVal, rVal);
        case 'tube':
          return createRoundTube('CHS', hVal, twVal);
        case 'rhs': {
          const r1 = Math.min(twVal * 2.5, Math.min(hVal, bVal) / 4);
          const r2 = Math.max(r1 - twVal, twVal * 0.5);
          return createRectangleHollowSection('RHS', hVal, bVal, twVal, r1, r2);
        }
        case 'channel': {
          const r = Math.min(twVal * 1.5, (hVal - 2 * tfVal - 4) / 2);
          const ex = bVal * 0.35;
          return createCChannelParallelFlange('Channel', hVal, bVal, twVal, tfVal, Math.max(r, 2), ex);
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }, [sectionType, selectedProfile, rectB, rectH, iH, iB, iTw, iTf, iR, tubeD, tubeT, rhsH, rhsB, rhsT, chH, chB, chTw, chTf]);

  // Rotated section properties using Mohr's circle of inertia
  const rotatedProps = useMemo(() => {
    if (rotation === 0 || !computedProps.props) return null;
    const theta = rotation * Math.PI / 180;
    const Iy = computedProps.props.Ixx_c;  // strong axis
    const Iz = computedProps.props.Iyy_c;  // weak axis

    // Mohr's circle transformation
    const Iy_rot = (Iy + Iz) / 2 + (Iy - Iz) / 2 * Math.cos(2 * theta);
    const Iz_rot = (Iy + Iz) / 2 - (Iy - Iz) / 2 * Math.cos(2 * theta);

    // Rotated bounding box dimensions
    const hVal = computedProps.props.h;  // profile height in mm
    const bVal = computedProps.props.b;  // profile width in mm
    const h_rot = hVal * Math.abs(Math.cos(theta)) + bVal * Math.abs(Math.sin(theta));
    const b_rot = hVal * Math.abs(Math.sin(theta)) + bVal * Math.abs(Math.cos(theta));

    // Approximate section moduli for rotated section
    const Wy_rot = h_rot > 0 ? Iy_rot / (h_rot / 2) : 0;
    const Wz_rot = b_rot > 0 ? Iz_rot / (b_rot / 2) : 0;

    // Approximate plastic moduli (scale proportionally)
    const Wply_rot = computedProps.wplX > 0 && computedProps.props.Wx > 0
      ? computedProps.wplX * (Wy_rot / computedProps.props.Wx) : 0;
    const Wplz_rot = computedProps.wplY > 0 && computedProps.props.Wy > 0
      ? computedProps.wplY * (Wz_rot / computedProps.props.Wy) : 0;

    return {
      A: computedProps.props.A, // unchanged
      Iy: Iy_rot,
      Iz: Iz_rot,
      Wy: Wy_rot,
      Wz: Wz_rot,
      Wply: Wply_rot,
      Wplz: Wplz_rot,
      h: h_rot,
      b: b_rot,
      iy: Iy_rot > 0 && computedProps.props.A > 0 ? Math.sqrt(Iy_rot / computedProps.props.A) : 0,
      iz: Iz_rot > 0 && computedProps.props.A > 0 ? Math.sqrt(Iz_rot / computedProps.props.A) : 0,
    };
  }, [rotation, computedProps]);

  const handleProfileSelect = useCallback((profile: ProfileEntry) => {
    setSelectedProfile(profile);
    setName(profile.name);
  }, []);

  /** Handle dimension edit from ProfileSvgPreview - clone to custom parametric profile */
  const handleDimensionEdit = useCallback((key: DimensionKey, value: number) => {
    // Get current profile dimensions
    let curH = 200, curB = 100, curTw = 6, curTf = 10, curR = 12;
    const baseName = name.replace(/_custom$/, '');

    if (sectionType === 'library' && selectedProfile) {
      const dims = SteelProfileLibrary.getBeamSection(selectedProfile);
      curH = dims.h * 1000;
      curB = (dims.b ?? 0.1) * 1000;
      curTw = (dims.tw ?? 0.006) * 1000;
      curTf = (dims.tf ?? 0.01) * 1000;
      // Estimate fillet radius from profile shape
      const sc = selectedProfile.data.shape_coords;
      if (selectedProfile.data.shape_name.includes('I-shape') && sc.length >= 5) {
        curR = sc[4]; // r value for I-shapes
      }
    } else if (sectionType === 'i-profile') {
      curH = parseFloat(iH) || 200;
      curB = parseFloat(iB) || 100;
      curTw = parseFloat(iTw) || 6;
      curTf = parseFloat(iTf) || 10;
      curR = parseFloat(iR) || 12;
    } else if (sectionType === 'rectangular') {
      curH = parseFloat(rectH) || 200;
      curB = parseFloat(rectB) || 100;
    }

    // Apply the edited dimension
    if (key === 'h') curH = value;
    if (key === 'b') curB = value;
    if (key === 'tw') curTw = value;
    if (key === 'tf') curTf = value;

    // Switch to i-profile parametric mode with updated values
    setSectionType('i-profile');
    setIH(curH.toFixed(1));
    setIB(curB.toFixed(1));
    setITw(curTw.toFixed(1));
    setITf(curTf.toFixed(1));
    setIR(curR.toFixed(1));
    setName(baseName + '_custom');
  }, [sectionType, selectedProfile, name, iH, iB, iTw, iTf, iR, rectH, rectB]);

  const handleTimberSelect = useCallback((timber: TimberProfileEntry) => {
    setSelectedTimber(timber);
    setName(timber.name);
  }, []);

  const handleSave = () => {
    if (!name.trim() || !onSave) return;

    let newSection: IBeamSection;

    // Handle concrete tab
    if (materialTab === 'concrete') {
      if (concreteShape === 'rectangular') {
        const bMm = parseFloat(concB) || 300;
        const hMm = parseFloat(concH) || 500;
        newSection = rectangularSection(bMm / 1000, hMm / 1000);
      } else {
        const dMm = parseFloat(concD) || 400;
        const r = dMm / 2;
        const areaVal = Math.PI * r * r; // mm²
        const iyVal = Math.PI * Math.pow(r, 4) / 4; // mm⁴
        newSection = {
          A: areaVal * 1e-6,
          I: iyVal * 1e-12,
          h: dMm / 1000,
          b: dMm / 1000,
          Iy: iyVal * 1e-12,
          Iz: iyVal * 1e-12,
          Wy: iyVal / r * 1e-9,
          Wz: iyVal / r * 1e-9,
        };
      }
      onSave(name.trim(), newSection);
      onClose();
      return;
    }

    // Handle timber tab
    if (materialTab === 'timber' && selectedTimber) {
      const td = selectedTimber.data;
      const hMm = td.shape_coords[0];
      const bMm = td.shape_coords[1];
      newSection = {
        A: td.area * 1e-6,
        I: td.iy * 1e-12,
        h: hMm / 1000,
        b: bMm / 1000,
        Iy: td.iy * 1e-12,
        Iz: td.iz * 1e-12,
        Wy: td.wy * 1e-9,
        Wz: td.wz * 1e-9,
      };
      onSave(name.trim(), newSection);
      onClose();
      return;
    }

    if (sectionType === 'library' && selectedProfile && computedProps.props) {
      const { props, wplX, wplY } = computedProps;
      const dims = SteelProfileLibrary.getBeamSection(selectedProfile);
      newSection = {
        A: props.A * 1e-6,
        I: props.Ixx_c * 1e-12,
        h: dims.h,
        b: dims.b,
        tw: dims.tw,
        tf: dims.tf,
        Iy: props.Ixx_c * 1e-12,
        Iz: props.Iyy_c * 1e-12,
        Wy: props.Wx * 1e-9,
        Wz: props.Wy * 1e-9,
        Wply: wplX * 1e-9,
        Wplz: wplY * 1e-9,
      };
    } else if (computedProps.props && sectionType !== 'custom') {
      const { props, wplX, wplY } = computedProps;
      newSection = {
        A: props.A * 1e-6,
        I: props.Ixx_c * 1e-12,
        h: props.h / 1000,
        b: props.b / 1000,
        Iy: props.Ixx_c * 1e-12,
        Iz: props.Iyy_c * 1e-12,
        Wy: props.Wx * 1e-9,
        Wz: props.Wy * 1e-9,
        Wply: wplX * 1e-9,
        Wplz: wplY * 1e-9,
      };
      if (sectionType === 'i-profile') {
        newSection.tw = parseFloat(iTw) / 1000;
        newSection.tf = parseFloat(iTf) / 1000;
      } else if (sectionType === 'rhs') {
        newSection.tw = parseFloat(rhsT) / 1000;
      } else if (sectionType === 'channel') {
        newSection.tw = parseFloat(chTw) / 1000;
        newSection.tf = parseFloat(chTf) / 1000;
      } else if (sectionType === 'tube') {
        newSection.tw = parseFloat(tubeT) / 1000;
      }
    } else {
      switch (sectionType) {
        case 'rectangular':
          newSection = rectangularSection(parseFloat(rectB) / 1000, parseFloat(rectH) / 1000);
          break;
        case 'i-profile':
          newSection = iProfileSection(
            parseFloat(iH) / 1000,
            parseFloat(iB) / 1000,
            parseFloat(iTw) / 1000,
            parseFloat(iTf) / 1000
          );
          break;
        case 'tube':
          newSection = tubularSection(parseFloat(tubeD) / 1000, parseFloat(tubeT) / 1000);
          break;
        default:
          newSection = {
            A: parseFloat(A) * 1e-6,
            I: parseFloat(I) * 1e-12,
            h: parseFloat(h) / 1000,
            Iy: parseFloat(I) * 1e-12,
            Iz: parseFloat(I) * 1e-12 * 0.1,
            Wy: parseFloat(I) * 1e-12 / (parseFloat(h) / 2000),
            Wz: parseFloat(I) * 1e-12 * 0.1 / (parseFloat(h) / 4000),
          };
      }
    }

    // Override with rotated properties when profile is rotated
    if (rotation !== 0 && rotatedProps) {
      newSection.I = rotatedProps.Iy * 1e-12;
      newSection.Iy = rotatedProps.Iy * 1e-12;
      newSection.Iz = rotatedProps.Iz * 1e-12;
      newSection.Wy = rotatedProps.Wy * 1e-9;
      newSection.Wz = rotatedProps.Wz * 1e-9;
      newSection.Wply = rotatedProps.Wply * 1e-9;
      newSection.Wplz = rotatedProps.Wplz * 1e-9;
      newSection.h = rotatedProps.h / 1000;
      newSection.b = rotatedProps.b / 1000;
    }

    onSave(name.trim(), newSection);
    onClose();
  };

  const formatValue = (val: number, unit: string, decimals = 2) => {
    if (Math.abs(val) < 1e-9) return `0 ${unit}`;
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(decimals)}×10⁶ ${unit}`;
    if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(decimals)}×10³ ${unit}`;
    if (Math.abs(val) < 0.01) return `${(val * 1e3).toFixed(decimals)}×10⁻³ ${unit}`;
    return `${val.toFixed(decimals)} ${unit}`;
  };

  // Concrete section SVG preview
  const concreteSvgPreview = useMemo(() => {
    if (materialTab !== 'concrete') return null;
    const svgW = 200;
    const svgH = 200;
    const pad = 30;

    if (concreteShape === 'rectangular') {
      const bMm = parseFloat(concB) || 300;
      const hMm = parseFloat(concH) || 500;
      const maxDim = Math.max(bMm, hMm);
      const scale = (Math.min(svgW, svgH) - 2 * pad) / maxDim;
      const rw = bMm * scale;
      const rh = hMm * scale;
      const rx = (svgW - rw) / 2;
      const ry = (svgH - rh) / 2;
      return (
        <svg className="concrete-preview-svg" width={svgW} height={svgH}>
          <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke="var(--text-secondary, #a0a0c0)" strokeWidth={2} />
          {/* Dimension lines */}
          <line x1={rx} y1={ry + rh + 15} x2={rx + rw} y2={ry + rh + 15} stroke="var(--text-muted, #6a6a8a)" strokeWidth={1} />
          <text x={rx + rw / 2} y={ry + rh + 25} textAnchor="middle" fill="var(--text-muted, #6a6a8a)" fontSize={10}>{bMm} mm</text>
          <line x1={rx + rw + 15} y1={ry} x2={rx + rw + 15} y2={ry + rh} stroke="var(--text-muted, #6a6a8a)" strokeWidth={1} />
          <text x={rx + rw + 20} y={ry + rh / 2} textAnchor="start" dominantBaseline="middle" fill="var(--text-muted, #6a6a8a)" fontSize={10}>{hMm} mm</text>
        </svg>
      );
    } else {
      const dMm = parseFloat(concD) || 400;
      const scale = (Math.min(svgW, svgH) - 2 * pad) / dMm;
      const cr = (dMm * scale) / 2;
      return (
        <svg className="concrete-preview-svg" width={svgW} height={svgH}>
          <circle cx={svgW / 2} cy={svgH / 2} r={cr} fill="none" stroke="var(--text-secondary, #a0a0c0)" strokeWidth={2} />
          <line x1={svgW / 2 - cr} y1={svgH / 2 + cr + 15} x2={svgW / 2 + cr} y2={svgH / 2 + cr + 15} stroke="var(--text-muted, #6a6a8a)" strokeWidth={1} />
          <text x={svgW / 2} y={svgH / 2 + cr + 25} textAnchor="middle" fill="var(--text-muted, #6a6a8a)" fontSize={10}>{dMm} mm</text>
        </svg>
      );
    }
  }, [materialTab, concreteShape, concB, concH, concD]);

  // Timber section properties for display
  const timberProps = useMemo(() => {
    if (!selectedTimber) return null;
    const td = selectedTimber.data;
    return {
      A: td.area,
      Iy: td.iy,
      Iz: td.iz,
      Wy: td.wy,
      Wz: td.wz,
      h: td.shape_coords[0],
      b: td.shape_coords[1],
    };
  }, [selectedTimber]);

  // Render concrete tab content
  const renderConcreteContent = () => (
    <div className="section-dialog-layout">
      <div className="section-input-panel">
        <div className="section-edit">
          <div className="form-group">
            <label>{t('sectionProps.name')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. C30/37 300x500"
            />
          </div>
          <div className="concrete-section-inputs">
            <div className="form-group">
              <label>{t('sectionProps.concreteShape')}</label>
              <select value={concreteShape} onChange={e => setConcreteShape(e.target.value as 'rectangular' | 'circular')}>
                <option value="rectangular">{t('sectionProps.rectangular')}</option>
                <option value="circular">{t('sectionProps.circular')}</option>
              </select>
            </div>
            {concreteShape === 'rectangular' && (
              <div className="form-row">
                <div className="form-group half">
                  <label>{t('sectionProps.width')}</label>
                  <input type="number" value={concB} onChange={e => setConcB(e.target.value)} />
                </div>
                <div className="form-group half">
                  <label>{t('sectionProps.height_mm')}</label>
                  <input type="number" value={concH} onChange={e => setConcH(e.target.value)} />
                </div>
              </div>
            )}
            {concreteShape === 'circular' && (
              <div className="form-group">
                <label>{t('sectionProps.diameter')}</label>
                <input type="number" value={concD} onChange={e => setConcD(e.target.value)} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="section-preview-panel">
        {concreteSvgPreview}
        <div className="computed-props">
          <div className="computed-props-title">Section Properties</div>
          <div className="computed-props-grid">
            {concreteShape === 'rectangular' ? (() => {
              const bMm = parseFloat(concB) || 300;
              const hMm = parseFloat(concH) || 500;
              const areaVal = bMm * hMm;
              const iyVal = bMm * Math.pow(hMm, 3) / 12;
              const izVal = hMm * Math.pow(bMm, 3) / 12;
              return (
                <>
                  <div className="prop-row"><span className="prop-label">A</span><span className="prop-value">{formatValue(areaVal, 'mm\u00B2')}</span></div>
                  <div className="prop-row"><span className="prop-label">I<sub>y</sub></span><span className="prop-value">{formatValue(iyVal, 'mm\u2074')}</span></div>
                  <div className="prop-row"><span className="prop-label">I<sub>z</sub></span><span className="prop-value">{formatValue(izVal, 'mm\u2074')}</span></div>
                  <div className="prop-row"><span className="prop-label">W<sub>el,y</sub></span><span className="prop-value">{formatValue(iyVal / (hMm / 2), 'mm\u00B3')}</span></div>
                  <div className="prop-row"><span className="prop-label">W<sub>el,z</sub></span><span className="prop-value">{formatValue(izVal / (bMm / 2), 'mm\u00B3')}</span></div>
                </>
              );
            })() : (() => {
              const dMm = parseFloat(concD) || 400;
              const r = dMm / 2;
              const areaVal = Math.PI * r * r;
              const iyVal = Math.PI * Math.pow(r, 4) / 4;
              return (
                <>
                  <div className="prop-row"><span className="prop-label">A</span><span className="prop-value">{formatValue(areaVal, 'mm\u00B2')}</span></div>
                  <div className="prop-row"><span className="prop-label">I<sub>y</sub></span><span className="prop-value">{formatValue(iyVal, 'mm\u2074')}</span></div>
                  <div className="prop-row"><span className="prop-label">I<sub>z</sub></span><span className="prop-value">{formatValue(iyVal, 'mm\u2074')}</span></div>
                  <div className="prop-row"><span className="prop-label">W<sub>el</sub></span><span className="prop-value">{formatValue(iyVal / r, 'mm\u00B3')}</span></div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );

  // Render timber tab content
  const renderTimberContent = () => (
    <div className="section-dialog-layout">
      <div className="section-input-panel">
        <div className="section-edit">
          <div className="form-group">
            <label>{t('sectionProps.name')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 100x300 GL"
            />
          </div>
          <div className="timber-selector">
            <div className="timber-header">
              <span className="timber-count">{allTimberProfiles.length} profiles available</span>
            </div>
            <div className="form-group">
              <label>{t('sectionProps.timberSearch')}</label>
              <input
                type="text"
                value={timberSearch}
                onChange={e => setTimberSearch(e.target.value)}
                placeholder="e.g. 100x300, GL..."
              />
            </div>
            {!timberSearch && (
              <div className="form-group">
                <label>{t('sectionProps.timberCategory')}</label>
                <select value={timberCategory} onChange={e => setTimberCategory(e.target.value as TimberCategory)}>
                  {TIMBER_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="profile-list">
              {timberResults.map(tp => (
                <div
                  key={tp.name}
                  className={`profile-item ${selectedTimber?.name === tp.name ? 'selected' : ''}`}
                  onClick={() => handleTimberSelect(tp)}
                >
                  <span className="profile-name">{tp.name}</span>
                  <span className="profile-type">{tp.data.shape_coords[0]}x{tp.data.shape_coords[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="section-preview-panel">
        {/* Timber rectangle preview */}
        {selectedTimber && (() => {
          const hMm = selectedTimber.data.shape_coords[0];
          const bMm = selectedTimber.data.shape_coords[1];
          const svgW = 200;
          const svgH = 200;
          const pad = 30;
          const maxDim = Math.max(hMm, bMm);
          const scale = (Math.min(svgW, svgH) - 2 * pad) / maxDim;
          const rw = bMm * scale;
          const rh = hMm * scale;
          const rx = (svgW - rw) / 2;
          const ry = (svgH - rh) / 2;
          return (
            <svg className="concrete-preview-svg" width={svgW} height={svgH}>
              <rect x={rx} y={ry} width={rw} height={rh} fill="none" stroke="#C4A35A" strokeWidth={2} />
              <line x1={rx} y1={ry + rh + 15} x2={rx + rw} y2={ry + rh + 15} stroke="var(--text-muted, #6a6a8a)" strokeWidth={1} />
              <text x={rx + rw / 2} y={ry + rh + 25} textAnchor="middle" fill="var(--text-muted, #6a6a8a)" fontSize={10}>{bMm} mm</text>
              <line x1={rx + rw + 15} y1={ry} x2={rx + rw + 15} y2={ry + rh} stroke="var(--text-muted, #6a6a8a)" strokeWidth={1} />
              <text x={rx + rw + 20} y={ry + rh / 2} textAnchor="start" dominantBaseline="middle" fill="var(--text-muted, #6a6a8a)" fontSize={10}>{hMm} mm</text>
            </svg>
          );
        })()}
        {timberProps && (
          <div className="computed-props">
            <div className="computed-props-title">Section Properties</div>
            <div className="computed-props-grid">
              <div className="prop-row"><span className="prop-label">A</span><span className="prop-value">{formatValue(timberProps.A, 'mm\u00B2')}</span></div>
              <div className="prop-row"><span className="prop-label">I<sub>y</sub></span><span className="prop-value">{formatValue(timberProps.Iy, 'mm\u2074')}</span></div>
              <div className="prop-row"><span className="prop-label">I<sub>z</sub></span><span className="prop-value">{formatValue(timberProps.Iz, 'mm\u2074')}</span></div>
              <div className="prop-row"><span className="prop-label">W<sub>el,y</sub></span><span className="prop-value">{formatValue(timberProps.Wy, 'mm\u00B3')}</span></div>
              <div className="prop-row"><span className="prop-label">W<sub>el,z</sub></span><span className="prop-value">{formatValue(timberProps.Wz, 'mm\u00B3')}</span></div>
              <div className="prop-row"><span className="prop-label">h</span><span className="prop-value">{timberProps.h} mm</span></div>
              <div className="prop-row"><span className="prop-label">b</span><span className="prop-value">{timberProps.b} mm</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Determine if save should be disabled based on active tab
  const isSaveDisabled = () => {
    if (!name.trim()) return true;
    if (materialTab === 'composite') return true;
    if (materialTab === 'timber' && !selectedTimber) return true;
    return false;
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="section-properties-dialog wide" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{isNew ? 'New Section' : t('sectionProps.title')}</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        {/* Material category tabs */}
        {isNew && (
          <div className="section-dialog-tabs">
            {(['steel', 'concrete', 'timber', 'composite'] as MaterialTab[]).map(tab => (
              <button
                key={tab}
                className={`section-dialog-tab ${materialTab === tab ? 'active' : ''}`}
                onClick={() => setMaterialTab(tab)}
              >
                {t(`sectionProps.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
              </button>
            ))}
          </div>
        )}

        <div className="dialog-content">
          {/* Steel tab: existing content */}
          {(materialTab === 'steel' || !isNew) && (
          <div className="section-dialog-layout">
            {/* Left: Profile Selection */}
            <div className="section-input-panel">
              {!isNew && section && (
                <div className="section-view">
                  <div className="section-name">{section.name}</div>
                  <div className="section-props-grid">
                    <div className="prop-row">
                      <span className="prop-label">A</span>
                      <span className="prop-value">{formatValue(section.section.A * 1e6, 'mm²')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">I<sub>y</sub></span>
                      <span className="prop-value">{formatValue(section.section.Iy ? section.section.Iy * 1e12 : section.section.I * 1e12, 'mm⁴')}</span>
                    </div>
                    {section.section.Iz && (
                      <div className="prop-row">
                        <span className="prop-label">I<sub>z</sub></span>
                        <span className="prop-value">{formatValue(section.section.Iz * 1e12, 'mm⁴')}</span>
                      </div>
                    )}
                    <div className="prop-row">
                      <span className="prop-label">h</span>
                      <span className="prop-value">{(section.section.h * 1000).toFixed(1)} mm</span>
                    </div>
                    {section.section.Wy && (
                      <div className="prop-row">
                        <span className="prop-label">W<sub>el,y</sub></span>
                        <span className="prop-value">{formatValue(section.section.Wy * 1e9, 'mm³')}</span>
                      </div>
                    )}
                    {section.section.Wz && (
                      <div className="prop-row">
                        <span className="prop-label">W<sub>el,z</sub></span>
                        <span className="prop-value">{formatValue(section.section.Wz * 1e9, 'mm³')}</span>
                      </div>
                    )}
                    {section.section.Wply && (
                      <div className="prop-row">
                        <span className="prop-label">W<sub>pl,y</sub></span>
                        <span className="prop-value">{formatValue(section.section.Wply * 1e9, 'mm³')}</span>
                      </div>
                    )}
                    {section.section.Wplz && (
                      <div className="prop-row">
                        <span className="prop-label">W<sub>pl,z</sub></span>
                        <span className="prop-value">{formatValue(section.section.Wplz * 1e9, 'mm³')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isNew && (
                <div className="section-edit">
                  <div className="form-group">
                    <label>Section Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. HEA 200"
                    />
                  </div>

                  <div className="form-group">
                    <label>Input Method</label>
                    <select value={sectionType} onChange={e => setSectionType(e.target.value as SectionType)}>
                      <option value="library">Profile Library</option>
                      <option value="custom">Manual</option>
                      <option value="rectangular">Rectangle (solid)</option>
                      <option value="i-profile">I-Profile (parametric)</option>
                      <option value="rhs">RHS/SHS (hollow)</option>
                      <option value="tube">CHS (tube)</option>
                      <option value="channel">UNP (channel)</option>
                    </select>
                  </div>

                  {sectionType === 'library' && (
                    <div className="library-selector">
                      <div className="library-header">
                        <span className="library-count">{SteelProfileLibrary.count} profiles available</span>
                      </div>
                      <div className="form-group">
                        <label>Search</label>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="e.g. HEA200, IPE300..."
                        />
                      </div>

                      {!searchQuery && (
                        <div className="form-group">
                          <label>Category</label>
                          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value as ProfileCategory)}>
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="profile-list">
                        {searchResults.map(profile => (
                          <div
                            key={profile.name}
                            className={`profile-item ${selectedProfile?.name === profile.name ? 'selected' : ''}`}
                            onClick={() => handleProfileSelect(profile)}
                          >
                            <span className="profile-name">{profile.name}</span>
                            <span className="profile-type">{profile.data.shape_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sectionType === 'custom' && (
                    <div className="custom-props">
                      <div className="form-row">
                        <div className="form-group half">
                          <label>A (mm²)</label>
                          <input type="number" value={A} onChange={e => setA(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>I<sub>y</sub> (mm⁴)</label>
                          <input type="number" value={I} onChange={e => setI(e.target.value)} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>h (mm)</label>
                        <input type="number" value={h} onChange={e => setH(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {sectionType === 'rectangular' && (
                    <div className="rect-props">
                      <div className="form-row">
                        <div className="form-group half">
                          <label>b (mm)</label>
                          <input type="number" value={rectB} onChange={e => setRectB(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>h (mm)</label>
                          <input type="number" value={rectH} onChange={e => setRectH(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {sectionType === 'i-profile' && (
                    <div className="i-props">
                      <div className="form-row">
                        <div className="form-group half">
                          <label>H (mm)</label>
                          <input type="number" value={iH} onChange={e => setIH(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>B (mm)</label>
                          <input type="number" value={iB} onChange={e => setIB(e.target.value)} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group third">
                          <label>t<sub>w</sub> (mm)</label>
                          <input type="number" value={iTw} onChange={e => setITw(e.target.value)} />
                        </div>
                        <div className="form-group third">
                          <label>t<sub>f</sub> (mm)</label>
                          <input type="number" value={iTf} onChange={e => setITf(e.target.value)} />
                        </div>
                        <div className="form-group third">
                          <label>r (mm)</label>
                          <input type="number" value={iR} onChange={e => setIR(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {sectionType === 'tube' && (
                    <div className="tube-props">
                      <div className="form-row">
                        <div className="form-group half">
                          <label>D (mm)</label>
                          <input type="number" value={tubeD} onChange={e => setTubeD(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>t (mm)</label>
                          <input type="number" value={tubeT} onChange={e => setTubeT(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {sectionType === 'rhs' && (
                    <div className="rhs-props">
                      <div className="form-row">
                        <div className="form-group half">
                          <label>H (mm)</label>
                          <input type="number" value={rhsH} onChange={e => setRhsH(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>B (mm)</label>
                          <input type="number" value={rhsB} onChange={e => setRhsB(e.target.value)} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>t (mm)</label>
                        <input type="number" value={rhsT} onChange={e => setRhsT(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {sectionType === 'channel' && (
                    <div className="channel-props">
                      <div className="form-row">
                        <div className="form-group half">
                          <label>H (mm)</label>
                          <input type="number" value={chH} onChange={e => setChH(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>B (mm)</label>
                          <input type="number" value={chB} onChange={e => setChB(e.target.value)} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group half">
                          <label>t<sub>w</sub> (mm)</label>
                          <input type="number" value={chTw} onChange={e => setChTw(e.target.value)} />
                        </div>
                        <div className="form-group half">
                          <label>t<sub>f</sub> (mm)</label>
                          <input type="number" value={chTf} onChange={e => setChTf(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Preview and Properties */}
            <div className="section-preview-panel">
              {/* SVG Preview */}
              {profileGeometry && sectionType !== 'custom' && (
                <div className="profile-preview">
                  <div className="profile-preview-header">
                    <span className="profile-preview-title">Profile Preview</span>
                    <div className="preview-options">
                      <label className="checkbox-option">
                        <input
                          type="checkbox"
                          checked={showNeutralAxes}
                          onChange={e => setShowNeutralAxes(e.target.checked)}
                        />
                        <span>Neutral Axes</span>
                      </label>
                      <label className="rotation-option">
                        <span>Rotation:</span>
                        <input
                          type="number"
                          value={rotation}
                          onChange={e => setRotation(parseFloat(e.target.value) || 0)}
                          min="-180"
                          max="180"
                          step="15"
                        />
                        <span>°</span>
                      </label>
                    </div>
                  </div>
                  <ProfileSvgPreview
                    profile={profileGeometry}
                    width={440}
                    height={400}
                    showDimensions={true}
                    showAxes={true}
                    showNeutralAxes={showNeutralAxes}
                    showFilletLines={showFilletLines}
                    rotation={rotation}
                    onDimensionEdit={onSave ? handleDimensionEdit : undefined}
                  />
                </div>
              )}

              {/* Computed Properties */}
              {computedProps.props && sectionType !== 'custom' && (
                <div className="computed-props">
                  <div className="computed-props-title">Section Properties</div>
                  <div className="computed-props-grid">
                    <div className="prop-row">
                      <span className="prop-label">A</span>
                      <span className="prop-value">{formatValue(computedProps.props.A, 'mm²')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">I<sub>y</sub></span>
                      <span className="prop-value">{formatValue(computedProps.props.Ixx_c, 'mm⁴')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">I<sub>z</sub></span>
                      <span className="prop-value">{formatValue(computedProps.props.Iyy_c, 'mm⁴')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">W<sub>el,y</sub></span>
                      <span className="prop-value">{formatValue(computedProps.props.Wx, 'mm³')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">W<sub>el,z</sub></span>
                      <span className="prop-value">{formatValue(computedProps.props.Wy, 'mm³')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">W<sub>pl,y</sub></span>
                      <span className="prop-value">{formatValue(computedProps.wplX, 'mm³')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">W<sub>pl,z</sub></span>
                      <span className="prop-value">{formatValue(computedProps.wplY, 'mm³')}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">i<sub>y</sub></span>
                      <span className="prop-value">{computedProps.props.rx.toFixed(1)} mm</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-label">i<sub>z</sub></span>
                      <span className="prop-value">{computedProps.props.ry.toFixed(1)} mm</span>
                    </div>
                  </div>

                  {rotatedProps && (
                    <div className="computed-props" style={{ marginTop: '8px' }}>
                      <div className="computed-props-title">Rotated Properties ({rotation}°)</div>
                      <div className="computed-props-grid">
                        <div className="prop-row">
                          <span className="prop-label">I<sub>y,rot</sub></span>
                          <span className="prop-value">{formatValue(rotatedProps.Iy, 'mm⁴')}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-label">I<sub>z,rot</sub></span>
                          <span className="prop-value">{formatValue(rotatedProps.Iz, 'mm⁴')}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-label">W<sub>el,y,rot</sub></span>
                          <span className="prop-value">{formatValue(rotatedProps.Wy, 'mm³')}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-label">W<sub>el,z,rot</sub></span>
                          <span className="prop-value">{formatValue(rotatedProps.Wz, 'mm³')}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-label">h<sub>rot</sub></span>
                          <span className="prop-value">{rotatedProps.h.toFixed(1)} mm</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-label">b<sub>rot</sub></span>
                          <span className="prop-value">{rotatedProps.b.toFixed(1)} mm</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedProfile && (
                    <div className="ifc-info">
                      <span className="ifc-label">IFC Type:</span>
                      <span className="ifc-value">{SteelProfileLibrary.getIfcProfileType(selectedProfile)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Concrete tab */}
          {materialTab === 'concrete' && isNew && renderConcreteContent()}

          {/* Timber tab */}
          {materialTab === 'timber' && isNew && renderTimberContent()}

          {/* Composite tab - placeholder */}
          {materialTab === 'composite' && isNew && (
            <div className="section-tab-placeholder">
              <div className="placeholder-icon">&#9881;</div>
              <div>{t('sectionProps.comingSoon')}</div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {isNew && onSave && (
            <button className="btn-primary" onClick={handleSave} disabled={isSaveDisabled()}>
              {t('common.add')}
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            {isNew ? t('common.cancel') : t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
