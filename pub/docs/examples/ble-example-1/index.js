'use strict';

let device = require('./device');

/**
 * Initializing all the necessary modules.
 */

device.init();

import noble from 'noble';

noble.on('stateChange', (state) => {
  if (state === 'poweredOn') {
    noble.startScanning();
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', (peripheral) => {
  log.info('Device ID: ' + peripheral.id);
  log.info('Device address: ' + peripheral.address);
  log.info('Device name: ' + peripheral.advertisement.localName);
});
