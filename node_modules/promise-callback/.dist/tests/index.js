'use strict';

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _ = require('../');

var _2 = _interopRequireDefault(_);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

(0, _2['default'])(function (arg, callback) {
  console.log('arg', arg, 'callback', callback);
  callback(undefined, 'arg1', 'arg2');
}, 'an arg').then(function (value) {
  return console.log('value', value);
}, function (error) {
  return console.log('error', error);
});

(0, _2['default'])(function (arg, callback) {
  console.log('arg', arg, 'callback', callback);
  callback('error', 'arg1', 'arg2');
}, 'an arg').then(function (value) {
  return console.log('value', value);
}, function (error) {
  for (var _len = arguments.length, rest = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    rest[_key - 1] = arguments[_key];
  }

  return console.log.apply(console, ['error', error].concat(rest));
});

var pfs = (0, _2['default'])(_fs2['default']);

pfs.writeFile('test.txt', 'wut').then(function () {
  return console.log('written');
}, function (e) {
  return console.log('error', e.stack);
});

(0, _2['default'])(dummyAsync).then(function (_ref) {
  var args = _ref.args;
  return console.log.apply(console, ['return'].concat(_toConsumableArray(args)));
}, function (error) {
  return console.log('error!', error.stack);
});

function dummyAsync(callback) {
  setTimeout(function () {
    return callback(undefined, 1, 2, 3);
  }, 500);
}
//# sourceMappingURL=../tests/index.js.map