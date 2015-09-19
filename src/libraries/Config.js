/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let config = {};
try {
  config = require('../../config.local.json');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }
}

export default config;
