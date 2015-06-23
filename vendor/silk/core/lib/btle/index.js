/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('../util');

module.exports = {
  prepare: () => {
    return new Promise(resolve => {

      // Wait until the system fully boots before trying to use bluetooth
      function waitForBoot() {
        if ('1' === util.getprop('sys.boot_completed')) {
          console.log('System booted.  Enabling Bluetooth services');

          // Hold off require()ing BT stuff until the interface is up.
          module.exports.configService = require('./config-service');
          //module.exports.ibeacon = require('./ibeacon.js');
          //module.exports.scanner = require('./scanner.js');

          resolve();
        } else {
          console.log('Waiting for sys.boot_completed=1');
          util.timeout(1000).then(waitForBoot);
        }
      }

      waitForBoot();
    });
  }
};
