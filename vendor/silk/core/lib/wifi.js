/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');

function init() {
  return new Promise(resolve => {
    console.log('Init WiFi');

    // Set the device hostname to something that is probably unique
    util.setprop('net.hostname', 'silk-' + util.getprop('ro.serialno'));

    resolve();
  });
}

module.exports = {
  init: init,
};
