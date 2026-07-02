import { IMaterial } from './types';

export const DEFAULT_MATERIALS: IMaterial[] = [
  {
    id: 1,
    name: 'Steel',
    E: 210e9,      // 210 GPa
    nu: 0.3,
    rho: 7850,     // kg/m³
    color: '#3b82f6',
    alpha: 12e-6   // 1/°C
  },
  {
    id: 2,
    name: 'Aluminum',
    E: 70e9,       // 70 GPa
    nu: 0.33,
    rho: 2700,
    color: '#a855f7',
    alpha: 23e-6
  },
  {
    id: 3,
    name: 'Concrete',
    E: 30e9,       // 30 GPa
    nu: 0.2,
    rho: 2400,
    color: '#6b7280',
    alpha: 10e-6
  },
  {
    id: 4,
    name: 'Wood',
    E: 12e9,       // 12 GPa
    nu: 0.3,
    rho: 600,
    color: '#92400e',
    alpha: 5e-6
  },
  {
    id: 5,
    name: 'Custom',
    E: 200e9,
    nu: 0.3,
    rho: 7800,
    color: '#10b981',
    alpha: 12e-6
  }
];

export function createMaterial(
  id: number,
  name: string,
  E: number,
  nu: number,
  rho: number = 7800,
  color: string = '#3b82f6'
): IMaterial {
  return { id, name, E, nu, rho, color };
}

export function formatModulus(E: number): string {
  if (E >= 1e9) {
    return `${(E / 1e9).toFixed(1)} GPa`;
  } else if (E >= 1e6) {
    return `${(E / 1e6).toFixed(1)} MPa`;
  }
  return `${E.toFixed(1)} Pa`;
}
