/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('../log')('btle');

module.exports = {
  init: () => {
    return new Promise(resolve => {
      log.info('BTLE initializing');
      let bleno = require('bleno');
      bleno.on('stateChange', state => {
        if (state !== 'poweredOn') {
          log.warn(`Ignoring BT stateChange to ${state}`);
          return;
        }
        log.info(`BTLE: ${state}`);

        module.exports.configService = require('./config-service');
        //module.exports.ibeacon = require('./ibeacon.js');
        //module.exports.scanner = require('./scanner.js');

        log.info('BTLE initialization complete');
        resolve();
      });

      // The bleno that everybody should use
      module.exports.bleno = bleno;
    });
  },
};
