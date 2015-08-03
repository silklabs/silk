/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

export default function configure(input = {}) {
  var defaults = {
    serverUrl: 'http://silk-test-server.herokuapp.com:5000'
  };

  for (var key in input) {
    defaults[key] = input[key];
  }
  return defaults;
}
