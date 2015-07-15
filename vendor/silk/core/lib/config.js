/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let bleno = null;
let btle = require('./btle');
let caps = require('./caps');
let log = require('./log')('config');
let ui = require('./ui');
let wifi = require('./wifi');

function runConfigService(id, resolve, reject) {
  const STATE = api.btleConfigService.state;
  let configService = btle.configService();
  let updateRssiInterval = null;

  bleno.setServices([configService]);
  bleno.on('servicesSet', errServicesSet => {
    if (errServicesSet) {
      throw new Error(errServicesSet);
    }
    log.info(`Started BTLE config service for device ${id}`);

    // TODO: get name from build config
    bleno.startAdvertising('Silkcam', [configService.uuid],
                           err => err && log.warn('Error: ' + err));
    bleno.on('advertisingStart', err => {
      if (err) {
        return reject(`runConfigService: ${err}`);
      }
      log.info('Started BTLE advertising');
    });
  });

  bleno.on('accept', clientAddr => {
    log.info('Accepted GATT connection from', clientAddr);
    // TODO: how do we associate the RSSI with a particular
    // connected central?
    let updateRssi = () => {
      bleno.updateRssi((err, rssi) => {
        if (err) {
          return reject(`runConfigService: ${err}`);
        }
        configService.updateRssi(rssi);
      });
    };
    if (updateRssiInterval) {
      clearInterval(updateRssiInterval);
    }
    updateRssiInterval = setInterval(updateRssi, 500);
  });

  bleno.on('disconnect', clientAddr => {
    log.info('GATT client', clientAddr, 'disconnected');
    if (updateRssiInterval) {
      clearInterval(updateRssiInterval);
    }
  });

  configService.on('stateChange', state => {
    log.info('Device configuration state is now', state);
    if (state !== STATE.REGISTERED) {
      return;
    }

    clearInterval(updateRssiInterval);
    bleno.stopAdvertising(() => {
      log.info('Stopped GAP advertising.');
    });

    wifi.forgetNetwork()
    .then(() => {
      wifi.joinNetwork(configService.ap,
        configService.unsecured ? '' : configService.secret);
    })
    .then(() => {
      log.info(`Successfully joined the network: ${configService.ap}`);
      // TODO: It might be better to block here until the device successfully
      //       contacts the server for the first time.
      resolve();
    });

  });
}

function configureDevice(id) {
  return new Promise((resolve, reject) => {
    Promise.resolve()
    //.then(wifi.forgetNetwork) // <-- Uncomment to force re-config on every start
    .then(wifi.networkConfigured)
    .then(resolve)
    .catch(() => {
      log.info('Device not configured, launching BTLE config service ...');
      if (!caps.has('btle-peripheral')) {
        log.warn('Device cannot do BTLE peripheral mode, skipping config service. You must configure wifi manually.');
        return resolve();
      }
      ui('setup');
      bleno = btle.bleno;
      runConfigService(id, resolve, reject);
    });
  });
}

module.exports = configureDevice;
