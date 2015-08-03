"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var throwError = _asyncToGenerator(function* (response) {
  var text = yield response.text();
  throw new Error("\n    " + response.statusText + " - " + response.url + "\n\n    " + text + "\n  ");
});

exports["default"] = throwError;

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { var callNext = step.bind(null, "next"); var callThrow = step.bind(null, "throw"); function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(callNext, callThrow); } } callNext(); }); }; }

module.exports = exports["default"];