/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let noble = require('noble');

let initPromise = new Promise(resolve => {
  noble.on('stateChange', state => {
    console.log(`noble: Bluetooth state changed to ${state}`);
    if (state === 'poweredOn') {
      initPromise = null;
      resolve();
    }
  });
});

export function start(callback) {
  if (initPromise) {
    return initPromise.then(() => start(callback));
  }
  noble.on('discover', callback);
  noble.startScanning([], true);
}
