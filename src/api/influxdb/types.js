/**
 * See: https://influxdb.com/docs/v0.9/write_protocols/line.html
 */

export class Float {
  static stringify(value) {
    return String(value);
  }

  static parse(value) {
    return parseFloat(value);
  }
}

export class Integer {
  static stringify(value) {
    return `${String(value)}i`;
  }

  static parse(value) {
    if (value[value.length - 1] !== 'i') {
      throw new Error(`Invalid integer value ${value}`);
    }
    return parseInt(value.slice(0, -1));
  }
}

// Named Str since String is reserved word...
export class Str {
  static parse(value) {
    // strip first and last value...
    let str = value.slice(1, -1);
    // remove double quotes...
    return str.replace(/"/gm, '');
  }

  static stringify(value) {
    let result = '"';
    for (let i = 0; i < value.length; i++) {
      let char = value[i];
      if (char === '"') {
        result += '\\';
      }
      result += char;
    }
    result += '"';
    return result;
  }
}

// Boolean is a reserved word...
export class Bool {

  static values = new Set([
    't',
    'T',
    'true',
    'TRUE',
    'f',
    'F',
    'false',
    'FALSE'
  ])

  static stringify(value) {
    return (value) ? 'true' : 'false';
  }

  static parse(value) {
    switch (value.toLowerCase()) {
      case 't':
      case 'true':
        return true;
      case 'f':
      case 'false':
        return false;
      default:
        throw new Error(`Cannot convert ${value} into a boolean`);
    }
  }
}

export class Timestamp {
  static stringify(value) {
    // Timestamp is expected to be in nanoseconds.
    return String((new Date(value).valueOf()) * 1000000);
  }

  static parse(value) {
    return new Date(parseInt(value, 10) / 1000000);
  }
}
