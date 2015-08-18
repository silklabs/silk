/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('../log')('btle');
let caps = require('../caps');

const expectedState = caps.has('qemu') ? 'poweredOff' : 'poweredOn';

module.exports = {
  init: () => {
    return new Promise(resolve => {
      log.info('BTLE initializing');

      let bleno = require('bleno');
      let noble = require('noble');

      let done = () => {
        module.exports.configService = require('./config-service');
        //module.exports.ibeacon = require('./ibeacon.js');
        //module.exports.scanner = require('./scanner.js');
        module.exports.bleno = bleno;
        module.exports.noble = noble;

        log.info('BTLE initialization complete');
        resolve();
      };

      let blenoConnected = false;
      let nobleConnected = false;

      bleno.on('stateChange', function blenoListener(state) {
        log.debug(`bleno 'stateChange': '${state}'`);
        if (state !== expectedState) {
          return;
        }
        bleno.removeListener('stateChange', blenoListener);
        blenoConnected = true;
        if (nobleConnected) {
          done();
        }
      });

      noble.on('stateChange', function nobleListener(state) {
        log.debug(`noble 'stateChange': '${state}'`);
        if (state !== expectedState) {
          return;
        }
        noble.removeListener('stateChange', nobleListener);
        nobleConnected = true;
        if (blenoConnected) {
          done();
        }
      });
    });
  },
};
