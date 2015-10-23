/**
 * Code generation based on the http schema types.
 *
 * Note: All code here assumes the output (toJSON) output of types this allows
 * us to focus on cases where we may be using json from a server/etc...
 */

import url from 'url';

const INDENT = /^\s+/gm;

/**
 * Strip all indent from input and insert a new indent of the given value.
 */
function formatIndent(input, indent) {
  let spacing = '';
  for (let i = 0; i < indent; i++) {
    spacing += ' ';
  }
  return input.trim().replace(INDENT, spacing);
}

function method(action) {
  let args = [];
  let urlParams = '';
  let perform = 'this.request(method, url);';
  let commentParams = '';

  action.params.forEach(param => {
    args.push(param.id);
    // url variable is referenced below...
    urlParams += `    url = url.replace(':${param.id}', ${param.id});\n`;
    commentParams += `  @param String ${param.id} (${param.name}) ${param.description || ''}\n`;
  });

  if (action.input) {
    args.push('payload');
    perform = 'this.requestWithBody(method, url, payload);';
    commentParams += `  @param Object payload of request`;
  }

  let comment = `
  /**
  ${formatIndent(action.description, 2)}

${commentParams}
  */`;

  // This code is written specifically to output somewhat pretty output however
  // the indent looks a little off internally because of this.
  let body = `
  ${comment}
  ${action.name}(${args.join(', ')}) {
    let method = '${action.method}';
    let url = '${action.path}';
    // Perform url subtitutions:
${urlParams}
    return ${perform}
  }
  `;

  return body;
}

const DEFAULTS = {
  baseClassPath: ''
};

export default function gen(schema, options = {}) {
  options = Object.assign({}, DEFAULTS, options);

  // Normalize pathing:
  let actions = schema.actions.map(action => {
    action = Object.assign({}, action);
    action.path = url.resolve(schema.prefix, action.path);
    return method(action);
  });

  let body = `
import BaseClass from '${options.baseClassPath}'

export default class extends BaseClass {

  name = '${schema.name}';
  prefix = '${schema.prefix};'

  ${actions.join('\n')}
}
  `;

  return body;

}
