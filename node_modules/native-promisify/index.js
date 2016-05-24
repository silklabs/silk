'use strict';

var isArray = Array.isArray,
  slice = [].slice;

module.exports = promisify;

/**
 * @param {function|object} - origin
 * @param {array|function} - filter
 */
function promisify(origin, filter) {
  var type = typeof origin;

  if (type === 'function') return wrapfn(origin);

  if (isArray(origin)) return origin;

  if (type === 'object') {
    var keys = Object.keys(origin);

    if (filter) {
      if (isArray(filter)) {
        keys = filter;
      } else if (typeof filter === 'function') {
        keys = keys.filter(filter);
      }
    }

    keys.forEach(function(key) {
      origin[key] = wrapfn(origin[key]);
    });
  }

  return origin;
}

/**
 * @param {function} - function
 */
function wrapfn(fn) {
  // function && not GeneratorFunction
  if (typeof fn !== 'function' || fn.constructor.name !== 'Function') return fn;

  return function() {
    var args = slice.call(arguments),
      ctx = this;

    var p = new Promise(function(resolve, reject) {
      args.push(function(error, result) {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });

      fn.apply(ctx, args);
    });

    return p;
  };
}
