// Can't use ES2015 syntax here unless we want to run it through babel
// first, which seems tedious.
module.exports = function(babel) {
  return {
    visitor: {
      CallExpression: function(path) {
        if (path.get('callee').matchesPattern('log.*')) {
          path.remove();
        }
      },
    },
  };
};
