export class Matrix {
  public data: number[][];
  public rows: number;
  public cols: number;

  constructor(rows: number, cols: number, fill: number = 0) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(rows).fill(null).map(() => Array(cols).fill(fill));
  }

  static fromArray(arr: number[][]): Matrix {
    const m = new Matrix(arr.length, arr[0].length);
    m.data = arr.map(row => [...row]);
    return m;
  }

  static identity(size: number): Matrix {
    const m = new Matrix(size, size);
    for (let i = 0; i < size; i++) {
      m.data[i][i] = 1;
    }
    return m;
  }

  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols, 0);
  }

  get(row: number, col: number): number {
    return this.data[row][col];
  }

  set(row: number, col: number, value: number): void {
    this.data[row][col] = value;
  }

  add(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for addition');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] + other.data[i][j];
      }
    }
    return result;
  }

  subtract(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for subtraction');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] - other.data[i][j];
      }
    }
    return result;
  }

  multiply(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(`Cannot multiply ${this.rows}x${this.cols} by ${other.rows}x${other.cols}`);
    }
    const result = new Matrix(this.rows, other.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[i][k] * other.data[k][j];
        }
        result.data[i][j] = sum;
      }
    }
    return result;
  }

  multiplyVector(v: number[]): number[] {
    if (this.cols !== v.length) {
      throw new Error('Matrix columns must match vector length');
    }
    const result: number[] = new Array(this.rows).fill(0);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result[i] += this.data[i][j] * v[j];
      }
    }
    return result;
  }

  scale(scalar: number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j] * scalar;
      }
    }
    return result;
  }

  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[j][i] = this.data[i][j];
      }
    }
    return result;
  }

  clone(): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = this.data[i][j];
      }
    }
    return result;
  }

  addAt(row: number, col: number, value: number): void {
    this.data[row][col] += value;
  }

  getRow(row: number): number[] {
    return [...this.data[row]];
  }

  getCol(col: number): number[] {
    return this.data.map(row => row[col]);
  }

  setRow(row: number, values: number[]): void {
    this.data[row] = [...values];
  }

  setCol(col: number, values: number[]): void {
    for (let i = 0; i < this.rows; i++) {
      this.data[i][col] = values[i];
    }
  }

  toString(): string {
    return this.data.map(row => row.map(v => v.toFixed(4)).join('\t')).join('\n');
  }
}
