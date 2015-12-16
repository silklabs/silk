/**
 * The metric model provides a base class which provides a high level interface
 * to submit data into influxdb (in the future maybe other backends).
 *
 * This class also provides simple number types (blame JS) as influxdb needs a
 * clear distinction between float and integers.
 *
 * @flow
 */

import assert from 'assert';

export class Float {
  value: number;
  constructor(value: number) {
    this.value = value;
  }

  toString(): string {
    if (Number.isInteger(this.value)) {
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
    assert(Number.isInteger(value));
    this.value = value;
  }

  toString(): string {
    return this.value.toFixed();
  }

  toJSON(): string {
    return this.toString();
  }
}

// XXX: Is regex fast enough?
const TAG_SANITIZE = /(,|=|\s)/g;

function sanitizeTagValue(value: string): string {
  return value.replace(TAG_SANITIZE, '\\$1');
}

export type Convertable = string|Integer|Float;

function convertType(input: Convertable): string {
  if (input instanceof Float) {
    return input.toString();
  }

  if (input instanceof Integer) {
    return `${input.toString()}i`;
  }

  if (typeof input === 'boolean') {
    return String(input);
  }

  return `"${input.toString()}"`;
}

export default class BaseMetric {
  static INDEX: Set<string> = new Set();
  static NAME: string;
  static DESC: string;

  /**
   * We store the map of properties here not because it's hard to do this with
   * ES6 classes but to reduce the amount of flow boilerplate. The type can be
   * declared once and used both in .properties and again in the constructor.
   */
  properties: Object;

  constructor(props: Object) {
    if (!this.constructor.NAME) {
      throw new Error('Please assign a name to your metric');
    }

    if (!this.constructor.DESC) {
      throw new Error('Please add a .DESC static property.');
    }

    // XXX: Does not appear to be a way to staticly check that the subclass has
    // not changed the type of INDEX so we verify it here.
    if (!(this.constructor.INDEX instanceof Set)) {
      throw new Error('.INDEX must be an instanceof Set.');
    }

    this.properties = props;
  }

  toJSON(): [string, Object, Object] {
    // We write out a json version of the influxdb line syntax
    // [$series, $tags, $properties].
    let tags = {};
    for (let propName of this.constructor.INDEX) {
      if (propName in this.properties) {
        tags[propName] = sanitizeTagValue(this.properties[propName]);
      }
    }

    let measurements = Object.keys(this.properties).reduce((result, propName) => {
      // XXX: Suboptimal... Do not process tags twice.
      if (this.constructor.INDEX.has(propName)) {
        return result;
      }

      // XXX: Should we warn on missing? Should not happen /w flow.
      if (this.properties[propName]) {
        result[propName] = convertType(this.properties[propName]);
      }

      return result;
    }, {});

    return [this.constructor.NAME, tags, measurements];
  }
}
