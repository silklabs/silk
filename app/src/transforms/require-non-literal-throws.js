'use strict';

module.exports = function(babel) {
  return {
    visitor: {
      // Rewrite code like
      //   require('non' + 'sense')
      // to
      //   throw new Error("Invalid require: 'non' + 'sense'")
      CallExpression: function(path) {
        const node = path.node;
        const callee = node.callee;
        const arg = node.arguments[0];
        if (callee.type !== 'Identifier' ||
            callee.name !== 'require' ||
            !arg ||
            arg.type === 'StringLiteral') {
          return;
        }
        const t = babel.types;
        const code = path.hub.file.code.slice(arg.start, arg.end);
        path.replaceWith(
          t.throwStatement(
            t.newExpression(
              t.identifier('Error'),
              [t.stringLiteral('Invalid require: ' + code)]
            )
          )
        );
      },
    },
  };
};
