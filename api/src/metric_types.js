/**
 * Metric types and conversions.
 *
 * @flow
 */

import invariant from 'assert';


const isInteger = Number.isInteger || function(value) {
  return typeof value === 'number' &&
    isFinite(value) &&
    Math.floor(value) === value;
};

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
    invariant(isInteger(value));
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
