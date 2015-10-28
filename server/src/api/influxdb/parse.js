/**
 * This module makes extensive use of iterators (and even wraps iterators with
 * iterators) your mind will melt unless you have some vague familiarity with
 * them.
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols
 */

import * as types from './types';

class BreakCharIterator {
  constructor(iter, char) {
    this.done = false;
    this._iter = iter;
    this._breakChar = char;

    // mark myself as an iterator...
    this[Symbol.iterator] = () => this;
  }

  peak() {
    return this._iter.peak();
  }

  stop(char) {
    return new BreakCharIterator(this, char);
  }

  next() {
    // invoke the parent iterator...
    let { char, escaped } = this._iter.peak();
    if (char === undefined || (!escaped && char === this._breakChar)) {
      this.done = true;
      return { done: true };
    }
    let next = this._iter.next();
    return next;
  }

}

// Compatible with the iterator protocol.
class LineIterator {
  constructor(str) {
    this._idx = 0;
    this._str = str;

    this.done = false;
    this._escaped = false;
    // mark myself as an iterator...
    this[Symbol.iterator] = () => this;
  }

  peak() {
    let value = this._str[this._idx];
    return { char: value, escaped: this._escaped };
  }

  stop(char) {
    return new BreakCharIterator(this, char);
  }

  next() {
    if (this.done) {
      return { done: true };
    }

    let value = this._str[this._idx++];
    let done = value === undefined;
    let escaped = this._escaped;

    this.done = done;
    this._escaped = value === '\\';

    // We mark the char as escaped but do not include backslash in our
    // iteration.
    if (this._escaped) {
      return this.next();
    }

    return {
      value: { char: value, escaped },
      done
    };
  }
}

function iterToStr(iter) {
  let str = '';
  for (let v of iter) {
    str += v.char;
  }
  return str;
}

function parseSeries(iterator) {
  let result = iterToStr(iterator.stop(','));
  // consume the , if present...
  iterator.next();
  return result;
}

function parseTags(iterator) {
  let tags = {};
  while (!iterator.done) {
    let key = iterToStr(iterator.stop('='));
    iterator.next();
    if (!key) {
      break;
    }
    let value = iterToStr(iterator.stop(','));
    iterator.next();
    tags[key] = value;
  }
  return tags;
}

function parseValueType(value) {
  if (value[0] === '"') {
    return types.Str.parse(value);
  }

  if (value[value.length - 1] === 'i') {
    return types.Integer.parse(value);
  }

  if (types.Bool.values.has(value)) {
    return types.Bool.parse(value);
  }

  return types.Float.parse(value);
}

function parseValues(iterator) {
  let values = {};
  while (!iterator.done) {
    let key = iterToStr(iterator.stop('='));
    iterator.next();
    if (!key) {
      break;
    }
    let value = parseValueType(iterToStr(iterator.stop(',')));
    iterator.next();
    values[key] = value;
  }
  return values;
}

function parseTimestamp(iterator) {
  let result = iterToStr(iterator);
  if (result) {
    return types.Timestamp.parse(result);
  }
}

/**
 * Helper to convert a influxdb line protocol value into a JS object.
 *
 * This function expects a single line callers should split lines themselves if
 * they need to parse multiple lines.
 *
 * XXX: This could _potentially_ be faster if written in iterator style.
 */
export default function parse(line) {
  let iterator = new LineIterator(line);

  // Each line consists of up to three segments:
  //
  // <key segment> <value segment> <timestamp segment>
  // ^^required^^^ ^^^^optional^^^ ^^^^^^optional^^^^^
  //
  // One space occurs between each segment.
  // See: https://influxdb.com/docs/v0.9/write_protocols/line.html

  let keySegment = iterator.stop(' ');
  // first segment attempt to parse
  let series = parseSeries(keySegment);
  let tags = parseTags(keySegment);

  if (!keySegment.done) {
    throw new Error('Unknown remaining tokens in key segment');
  }

  // move past the key segment...
  iterator.next();
  let valueSegment = iterator.stop(' ');
  let values = parseValues(valueSegment);

  if (!valueSegment.done) {
    throw new Error('Unknown remianing tokens after value segment');
  }

  let timestamp = parseTimestamp(iterator);

  return {
    series,
    tags,
    values,
    timestamp
  };
}
