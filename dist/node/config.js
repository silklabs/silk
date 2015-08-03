/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports['default'] = configure;

function configure() {
  var input = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  var defaults = {
    serverUrl: 'https://silk-test-server.herokuapp.com:5000'
  };

  for (var key in input) {
    defaults[key] = input[key];
  }
  return defaults;
}

module.exports = exports['default'];