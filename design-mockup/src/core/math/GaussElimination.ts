import { Matrix } from './Matrix';

export function solveLinearSystem(A: Matrix, b: number[]): number[] {
  const n = A.rows;

  if (A.rows !== A.cols) {
    throw new Error('Matrix must be square');
  }
  if (b.length !== n) {
    throw new Error('Vector length must match matrix size');
  }

  // Create augmented matrix [A|b]
  const aug = new Matrix(n, n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug.set(i, j, A.get(i, j));
    }
    aug.set(i, n, b[i]);
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug.get(col, col));
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug.get(row, col));
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    // Check for singular matrix
    if (maxVal < 1e-12) {
      throw new Error(`Matrix is singular or nearly singular at column ${col}`);
    }

    // Swap rows
    if (maxRow !== col) {
      for (let j = col; j <= n; j++) {
        const temp = aug.get(col, j);
        aug.set(col, j, aug.get(maxRow, j));
        aug.set(maxRow, j, temp);
      }
    }

    // Eliminate column
    for (let row = col + 1; row < n; row++) {
      const factor = aug.get(row, col) / aug.get(col, col);
      for (let j = col; j <= n; j++) {
        aug.set(row, j, aug.get(row, j) - factor * aug.get(col, j));
      }
    }
  }

  // Back substitution
  const x: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug.get(i, n);
    for (let j = i + 1; j < n; j++) {
      sum -= aug.get(i, j) * x[j];
    }
    x[i] = sum / aug.get(i, i);
  }

  return x;
}

export function solveWithConstraints(
  K: Matrix,
  F: number[],
  fixedDofs: number[],
  prescribedValues: number[] = []
): number[] {
  const Kmod = K.clone();
  const Fmod = [...F];

  // Apply boundary conditions using penalty method
  const penalty = 1e20;

  for (let i = 0; i < fixedDofs.length; i++) {
    const dof = fixedDofs[i];
    const value = prescribedValues[i] || 0;

    Kmod.set(dof, dof, Kmod.get(dof, dof) + penalty);
    Fmod[dof] = penalty * value;
  }

  return solveLinearSystem(Kmod, Fmod);
}
