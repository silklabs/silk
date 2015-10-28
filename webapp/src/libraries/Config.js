/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import merge from 'lodash.merge';

// Default configuration...
let DEFAULT = {
  'debug': 'silk-*,-silk-*:debug',
};

function load() {
  let config = {};
  try {
    // Note: that to resolve this path correctly it must be passed as string
    // literal
    config = require('../../config.local.json');
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
  }
  config = merge({}, DEFAULT, config);
  return config;
}

let config = load();
export default config;

