// Can't use ES2015 syntax here unless we want to run it through babel
// first, which seems tedious.
module.exports = function(babel) {
  return {
    visitor: {
      Identifier: function(path) {
        if (path.node.name === '__DEV__') {
          path.replaceWith(babel.types.booleanLiteral(false));
        }
      },
    },
  };
};
