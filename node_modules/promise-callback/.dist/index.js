'use strict';

module.exports = function promise(fn) {
  for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    args[_key - 1] = arguments[_key];
  }

  if (typeof fn === 'function') {
    return new Promise(function (resolve, reject) {
      fn.apply(undefined, args.concat([function (error) {
        for (var _len2 = arguments.length, rest = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
          rest[_key2 - 1] = arguments[_key2];
        }

        if (error) reject({ error: error, args: rest });else resolve(rest.length === 1 ? rest[0] : rest);
      }]));
    });
  } else if (typeof fn === 'object') {
    var wrapper = {};

    var _loop = function (key) {
      var value = fn[key];
      if (typeof value === 'function') {
        wrapper[key] = function () {
          for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            args[_key3] = arguments[_key3];
          }

          return promise.apply(undefined, [value].concat(args));
        };
      }
    };

    for (var key in fn) {
      _loop(key);
    }

    return wrapper;
  }

  throw Error('Sorry, I don\'t know how to handle', fn);
};
//# sourceMappingURL=index.js.map