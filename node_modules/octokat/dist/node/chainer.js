(function() {
  var Chainer, injectVerbMethods, plus,
    slice = [].slice;

  plus = require('./plus');

  injectVerbMethods = require('./verb-methods');

  Chainer = function(request, path, name, contextTree, fn) {
    var fn1;
    if (fn == null) {
      fn = function() {
        var args, separator;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        if (!args.length) {
          throw new Error('BUG! must be called with at least one argument');
        }
        if (name === 'compare') {
          separator = '...';
        } else {
          separator = '/';
        }
        return Chainer(request, path + "/" + (args.join(separator)), name, contextTree);
      };
    }
    injectVerbMethods(request, path, fn);
    if (typeof fn === 'function' || typeof fn === 'object') {
      fn1 = function(name) {
        delete fn[plus.camelize(name)];
        return Object.defineProperty(fn, plus.camelize(name), {
          configurable: true,
          enumerable: true,
          get: function() {
            return Chainer(request, path + "/" + name, name, contextTree[name]);
          }
        });
      };
      for (name in contextTree || {}) {
        fn1(name);
      }
    }
    return fn;
  };

  module.exports = Chainer;

}).call(this);
