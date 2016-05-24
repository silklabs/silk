'use strict';

var promisify = require('native-promisify'),
  thunkify = require('thunkify');

/**
 * @param origin  {function | object}
 * @param type    {string}
 * @param ignores {array}
 */
module.exports = function(origin, type, ignores) {
  if (Array.isArray(type)) {
    ignores = type;
    type = null;
  }

  if (type === 'thunk') {
    if (typeof origin === 'function') {
      return thunkify(origin);
    }

    if (typeof origin === 'object') {
      return thunkifyObject(origin, ignores);
    }
  } else {
    // default: promisify
    if (typeof origin === 'function') {
      return promisify(origin);
    }

    if (typeof origin === 'object') {
      return promisifyObject(origin, ignores);
    }
  }
};

function thunkifyObject(obj, ignores) {
  for (var i in obj) {
    if (typeof obj[i] === 'function' && !ignore(ignores, i)) {
      obj[i] = thunkify(obj[i]);
    }
  }

  return obj;
}

function promisifyObject(obj, ignores) {
  for (var i in obj) {
    if (typeof obj[i] === 'function' && !ignore(ignores, i)) {
      obj[i] = promisify(obj[i]);
    }
  }

  return obj;
}

function ignore(ignores, key) {
  return ignores && ignores.indexOf(key) >= 0;
}
