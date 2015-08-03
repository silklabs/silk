'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { var callNext = step.bind(null, 'next'); var callThrow = step.bind(null, 'throw'); function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(callNext, callThrow); } } callNext(); }); }; }

var _fetch = require('./fetch');

var _fetch2 = _interopRequireDefault(_fetch);

var _fetch_error = require('./fetch_error');

var _fetch_error2 = _interopRequireDefault(_fetch_error);

exports['default'] = _asyncToGenerator(function* (url, body) {
  var method = arguments.length <= 2 || arguments[2] === undefined ? 'POST' : arguments[2];

  var request = {
    method: method,
    headers: {}
  };

  if (body) {
    request.headers.Accept = 'application/json';
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }

  var response = yield (0, _fetch2['default'])(url, request);
  if (!response.ok) {
    yield (0, _fetch_error2['default'])(response);
  }
  return response.json();
});
module.exports = exports['default'];