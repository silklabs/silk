'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports['default'] = isImmutableDefault;

function isImmutableDefault(value) {
  return typeof value !== 'object' || value === null || typeof value === 'undefined';
}

module.exports = exports['default'];