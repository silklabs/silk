/**
 * Metric types and conversions.
 *
 * @flow
 */

const isInteger = Number.isInteger || function(value) {
  return typeof value === 'number' &&
    isFinite(value) &&
    Math.floor(value) === value;
};

function assertIsInteger(value: number): void {
  if (!(typeof value === 'number')) {
    throw new Error(`Value '${value}' should have been type "number"`);
  }
  if (!isFinite(value)) {
    throw new Error(`Number '${value}' should have been finite`);
  }
  if (!(Math.floor(value) === value)) {
    throw new Error(`Number '${value}' should have rounded to itself`);
  }
}

export class Float {
  value: number;
  constructor(value: number) {
    this.value = value;
  }

  toString(): string {
    if (isInteger(this.value)) {
      return `${this.value}.0`;
    }

    return String(this.value);
  }

  toJSON(): string {
    return this.toString();
  }
}

export class Integer {
  value: number;
  constructor(value: number) {
    assertIsInteger(value);
    this.value = value;
  }

  toString(): string {
    return this.value.toFixed();
  }

  toJSON(): string {
    return this.toString();
  }
}

export default { Integer, Float };
