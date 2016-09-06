/**
 * The metric model provides a base class which provides a high level interface
 * to submit data into influxdb (in the future maybe other backends).
 *
 * This class also provides simple number types (blame JS) as influxdb needs a
 * clear distinction between float and integers.
 *
 * @flow
 */

import invariant from 'assert';
import { Float, Integer } from './metric_types';

// XXX: Is regex fast enough?
const TAG_SANITIZE = /(,|=|\s)/g;

export function sanitizeTagValue(value: string): string {
  return value.replace(TAG_SANITIZE, '\\$1');
}

export type Convertable = string|boolean|Integer|Float;
export type StringToConvertableDict = {[key: string]: Convertable};
export type StringToStringDict = {[key: string]: string};
export type Point =
  [string, StringToStringDict, StringToStringDict, number];

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
  static NAME: string;
  static DESC: string;
  static INDEX: ?Set<string> = null;

  /**
   * We store the map of properties here not because it's hard to do this with
   * ES6 classes but to reduce the amount of flow boilerplate. The type can be
   * declared once and used both in .properties and again in the constructor.
   */
  properties: StringToConvertableDict;

  constructor(props: StringToConvertableDict) {
    invariant(this.constructor.NAME, 'Please assign a name to your metric');
    invariant(this.constructor.DESC, 'Please add a .DESC static property.');

    const index = this.constructor.INDEX;
    if (index) {
      // XXX: Turn this back on once we figure out why it fails sometimes for
      // travis app builds...
      //invariant(index.constructor.name === 'Set',
      //          '.INDEX must be an instanceof Set.');
    }

    props = Object.assign({}, props);

    const keys = Object.keys(props);
    invariant(keys.length, 'Empty properties');

    if (index) {
      keys.forEach((propName) => {
        if (index.has(propName)) {
          const value = props[propName];
          const type = typeof value;
          invariant(type === 'string' ||
                    type === 'boolean' ||
                    type === 'number',
                    `Tag value for '${propName}' is invalid: ` +
                    `${value.toString()} (${type})`);
          if (type === 'string') {
            if (!value) {
              // Empty tags get rejected by InfluxDB so just delete them.
              delete props[propName];
            }
          } else {
            props[propName] = String(value);
          }
        }
      });
    }

    this.properties = props;
  }

  serialize(
    commonTags: StringToStringDict = {}
  ): [string, StringToStringDict, StringToStringDict] {
    // We return an array that is similar to the influxdb line syntax:
    //   [$series, $tags, $properties].
    const tags = Object.assign({}, commonTags);
    const measurements = {};

    Object.keys(this.properties).forEach((propName) => {
      const value = this.properties[propName];

      // XXX: Should we warn on missing? Should not happen /w flow.
      if (this.constructor.INDEX && this.constructor.INDEX.has(propName)) {
        invariant(typeof value === 'string');
        tags[propName] = sanitizeTagValue(value);
      } else {
        measurements[propName] = convertType(value);
      }
    });

    return [this.constructor.NAME, tags, measurements];
  }

  toJSON(): [string, StringToStringDict, StringToStringDict] {
    return this.serialize();
  }
}
