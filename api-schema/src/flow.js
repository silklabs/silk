/**
 * Module to aid in converting JSON Schema to flowtype annotations...
 *
 * This is a best effort and may exclude or simplify some types with "any".
 *
 * @flow
 */

import camelcase from 'camel-case';

const INDENT = '  ';
const DEFAULT_TYPE = 'any';
const TRIVIAL_TYPES = {
  // JSON Schema type to flow type...
  number: 'number',
  integer: 'number',
  string: 'string',
  boolean: 'bool',
};

const SANITIZED_NAME = /[^a-zA-Z0-0_]/;

type ConvertType = {
  typeName: string;
  types: Array<string>;
  flow: string;
}

type ConvertArrayType = {
  types: Array<string>;
  typeName: string;
}

export function convertObject(
  name: string,
  input: any,
  seenNames: {[key: string]: bool} = {}
): ConvertType {
  if (name in seenNames) {
    // XXX: Lame but this is an unlikely case...
    name = `${name}_$`;
    return convertObject(name, input, seenNames);
  }

  seenNames[name] = true;
  let typeName = camelcase(name.replace(SANITIZED_NAME, ''));
  typeName = `${typeName[0].toUpperCase()}${typeName.slice(1)}`;

  let template = `type ${typeName} = {\n`;
  let types = [];

  for (let propName in input.properties) {
    let prop = input.properties[propName];
    let required = input.required && input.required.indexOf(propName) !== -1;
    let isTrivial = prop.type in TRIVIAL_TYPES;
    let requiredStr = required ? '' : '?';

    template += ' ';
    if (isTrivial) {
      template += `${propName}: ${requiredStr}${convertTrivial(prop)};\n`;
      continue;
    }

    if (prop.type === 'array') {
      let { typeName: subtypeName, types: subTypes } = convertArray(
        name + '_' + propName,
        prop
      );

      types = types.concat(subTypes);
      template += `${propName}: ${requiredStr}${subtypeName};\n`;
      continue;
    }

    if (prop.type === 'object') {
      let { typeName: subtypeName, flow, types: subTypes } = convertObject(
        name + '_' + propName,
        prop,
        seenNames
      );

      // Append all the sub types...
      types = types.concat(subTypes);
      types.push(flow);

      // Prepend the new type...
      template += `${propName}: ${requiredStr}${subtypeName};\n`;

      continue;
    }

    template += `${propName}: any;\n`;
  }

  template += '};\n';

  return {
    flow: template,
    types: types,
    typeName
  };
}

function convertArray(name: string, input: any): ConvertArrayType {
  let prop = input.items[0];
  if (prop && prop.type in TRIVIAL_TYPES) {
    return {
      typeName: `Array<${convertTrivial(prop)}>`,
      types: []
    };
  }

  if (prop && prop.type === 'array') {
    let { typeName: innerType, types } = convertObject(name, prop);
    return {
      typeName: `Array<${innerType}>`,
      types: types
    };
  }

  if (prop && prop.type === 'object') {
    let { typeName: innerType, flow, types } = convertObject(name, prop);
    return {
      typeName: `Array<${innerType}>`,
      types: [flow].concat(types)
    }
  }
  return { typeName: 'Array<any>', types: [] };
}

function convertTrivial(input: any): string {
  if (input.type in TRIVIAL_TYPES) {
    return TRIVIAL_TYPES[input.type];
  }
  return DEFAULT_TYPE;
}

export default function convert(name: string, input: any): string {
  switch(input.type) {
    case 'object':
      let res = convertObject(name, input);
      return `${res.types.join('\n')}\n${res.flow}`;
    case 'array':
      return convertArray(name, input).typeName;
    default:
      return convertTrivial(input);
  }
};
