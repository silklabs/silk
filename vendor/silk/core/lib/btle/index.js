/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

module.exports = {
  init: () => {
    return new Promise(resolve => {
      console.log('BTLE initializing');
      let bleno = require('bleno');
      bleno.on('stateChange', state => {
        if (state !== 'poweredOn') {
          console.warn('Ignoring BT stateChange to ', state);
          return;
        }
        console.log(`BTLE: ${state}`);

        module.exports.configService = require('./config-service');
        //module.exports.ibeacon = require('./ibeacon.js');
        //module.exports.scanner = require('./scanner.js');

        console.log('BTLE initialization complete');
        resolve();
      });

      // The bleno that everybody should use
      module.exports.bleno = bleno;
    });
  },
};
