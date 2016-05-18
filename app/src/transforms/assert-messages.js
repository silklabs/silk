// Can't use ES2015 syntax here unless we want to run it through babel
// first, which seems tedious.
'use strict';

const path = require('path');
const projectRoot = path.resolve(__dirname, path.join('..', '..', '..'));

module.exports = function(babel) {
  return {
    visitor: {
      // Rewrite code like
      //   invariant(foo === bar);
      // to
      //   invariant(foo === bar, 'AssertionFailure at app/src/Frobnicator.js:42: foo === bar');
      CallExpression: function(nodePath) {
        if (!nodePath.get('callee').isIdentifier({name: 'invariant'}) &&
            !nodePath.get('callee').isIdentifier({name: 'assert'})) {
          return;
        }
        if (nodePath.node.arguments.length !== 1) {
          return;
        }

        const condition = nodePath.node.arguments[0];
        let message = 'AssertionFailure';
        let filename = nodePath.hub.file.opts.filename;
        if (filename) {
          filename = path.relative(projectRoot, filename);
          message += ' at ' + filename + ':' + condition.loc.start.line;
        }
        const code = nodePath.hub.file.code.slice(condition.start, condition.end);
        message += ': ' + code;

        nodePath.replaceWith(babel.types.callExpression(
          nodePath.node.callee,
          [condition, babel.types.stringLiteral(message)]
        ));
      },
    },
  };
};
