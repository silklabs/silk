/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

export default function configure(input = {}) {
  var defaults = {
    serverUrl: 'https://silk-test-server.herokuapp.com'
  };

  for (var key in input) {
    defaults[key] = input[key];
  }
  return defaults;
}
