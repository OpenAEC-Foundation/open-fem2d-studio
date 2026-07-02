export class Vector {
  public data: number[];
  public length: number;

  constructor(length: number, fill: number = 0) {
    this.length = length;
    this.data = new Array(length).fill(fill);
  }

  static fromArray(arr: number[]): Vector {
    const v = new Vector(arr.length);
    v.data = [...arr];
    return v;
  }

  static zeros(length: number): Vector {
    return new Vector(length, 0);
  }

  get(index: number): number {
    return this.data[index];
  }

  set(index: number, value: number): void {
    this.data[index] = value;
  }

  add(other: Vector): Vector {
    if (this.length !== other.length) {
      throw new Error('Vector dimensions must match for addition');
    }
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] + other.data[i];
    }
    return result;
  }

  subtract(other: Vector): Vector {
    if (this.length !== other.length) {
      throw new Error('Vector dimensions must match for subtraction');
    }
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] - other.data[i];
    }
    return result;
  }

  scale(scalar: number): Vector {
    const result = new Vector(this.length);
    for (let i = 0; i < this.length; i++) {
      result.data[i] = this.data[i] * scalar;
    }
    return result;
  }

  dot(other: Vector): number {
    if (this.length !== other.length) {
      throw new Error('Vector dimensions must match for dot product');
    }
    let sum = 0;
    for (let i = 0; i < this.length; i++) {
      sum += this.data[i] * other.data[i];
    }
    return sum;
  }

  norm(): number {
    return Math.sqrt(this.dot(this));
  }

  normalize(): Vector {
    const n = this.norm();
    if (n === 0) return this.clone();
    return this.scale(1 / n);
  }

  clone(): Vector {
    return Vector.fromArray(this.data);
  }

  addAt(index: number, value: number): void {
    this.data[index] += value;
  }

  toArray(): number[] {
    return [...this.data];
  }

  toString(): string {
    return `[${this.data.map(v => v.toFixed(4)).join(', ')}]`;
  }
}
