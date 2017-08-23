/**
 * Babel plugin that rewrites `require()` calls and `import` statements.
 *
 * The plugin accepts the following configuration options:
 *
 * {
 *   "aliases": {
 *     "crypto": "crypto-browserify",
 *     "zlib": "zlib-browserify",
 *   },
 *   "throwForModules": [
 *     "node-native-stuff",
 *     "optional-dependency",
 *     "never-available",
 *   ],
 *   "throwForMissingFiles": [
 *     "/path/to/optional/configuration.json",
 *     "/path/to/internal/config.json",
 *   ],
 *   "throwForNonStringLiteral": true,
 * }
 *
 * @noflow
 */

'use strict';

const fs = require('fs');
const path = require('path');

function throwNewError(t, message) {
  return t.throwStatement(
    t.newExpression(t.identifier('Error'), [t.stringLiteral(message)])
  );
}

module.exports = function(babel) {
  return {
    visitor: {
      ImportDeclaration: function(nodePath, state) {
        const node = nodePath.node;
        const arg = node.source;

        if (!arg || arg.type !== 'StringLiteral') {
          return;
        }

        const t = babel.types;
        const opts = state.opts;

        if (opts.aliases && arg.value in opts.aliases) {
          const replacement = opts.aliases[arg.value];
          nodePath.replaceWith(
            t.importDeclaration(node.specifiers, t.stringLiteral(replacement))
          );
        }
      },

      CallExpression: function(nodePath, state) {
        const node = nodePath.node;
        const callee = node.callee;
        const arg = node.arguments[0];

        if (callee.type !== 'Identifier' || callee.name !== 'require' || !arg) {
          return;
        }

        const t = babel.types;
        const opts = state.opts;

        // If the require() argument is not a string literal, replace the
        // require() call with an exception being thrown.
        if (arg.type !== 'StringLiteral') {
          if (opts.throwForNonStringLiteral) {
            const code = nodePath.hub.file.code.slice(arg.start, arg.end);
            nodePath.replaceWith(throwNewError(t, 'Invalid require: ' + code));
          }
          return;
        }

        // If the require() argument is in the alias map, simply
        // rewrite the argument accordingly.
        if (opts.aliases && arg.value in state.opts.aliases) {
          const replacement = opts.aliases[arg.value];
          nodePath.replaceWith(
            t.callExpression(callee, [t.stringLiteral(replacement)])
          );
          return;
        }

        // If the require() argument is a module that's blacklisted as
        // never being resolvable, replace the require() call with an
        // exception being thrown. This mimics webpack's default behavior
        // for missing modules, but requires consumers to explicitly
        // blacklist every affected module rather than being the default.
        if (opts.throwForModules &&
            opts.throwForModules.length &&
            opts.throwForModules.indexOf(arg.value) !== -1) {
          nodePath.replaceWith(
            throwNewError(t, 'Could not resolve: ' + arg.value)
          );
          return;
        }

        // If the require() argument points to a missing file whitelisted
        // for being optional, replace the require() call with an exception
        // being thrown. This is similar to `throwForModules`, but (a) for
        // relative imports and (b) will not throw if the referenced file is
        // in fact present.
        if (opts.throwForMissingFiles &&
            opts.throwForMissingFiles.length &&
            arg.value.startsWith('.') &&
            state.file.opts.filename) {
          const absPath = path.resolve(
            path.dirname(state.file.opts.filename),
            arg.value
          );
          if (opts.throwForMissingFiles.indexOf(absPath) !== -1 &&
              !fs.existsSync(absPath)) {
            nodePath.replaceWith(
              throwNewError(t, 'Could not resolve: ' + arg.value)
            );
            return;
          }
        }

      },
    },
  };
};
