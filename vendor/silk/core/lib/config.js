/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('silk-api');
let bleno = null;
let fs = require('fs');
let spawnSync = require('child_process').spawnSync;
let btle = require('./btle');
let caps = require('./caps');
let ui = require('./ui');

let PS_ENTRY_RX =
      '^(\\w+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\w+)\\s+(\\w+)\\s+(\\w+)\\s+(.+)$';

/**
 *
 *  WARNING!!! --- the result of kickWifi() depends on the state of
 *  the android IP stack.  kickWifi() works correctly under the
 *  following conditions
 *
 *   1. New image has been flashed.
 *   2. Access point "X" has been joined.
 *   3. Access point "X" is either out of range or "forgotten".
 *   4. |kickWifi("Y", "psk")| where X != Y.
 *
 * This results in AP "Y" being joined.
 *
 * In particular, attempting to kickWifi() on a fresh flash WILL FAIL.
 */
function kickWifi(ssid, psk) {
  console.log('Preparing AP', ssid,
              !psk ? '[open]' : ('[secret length=' + psk.length + ']'));

  var WPA_SUPP_CONF = '/data/misc/wifi/wpa_supplicant.conf';
  var networkInfo =
`\n
network={
\tssid="${ssid}"
`;
  if (psk) {
    networkInfo +=
`\tpsk="${psk}"
\tkey_mgmt=WPA-PSK
`;
  }
  networkInfo += '}\n';
  // Add new network to conf.
  fs.appendFile(WPA_SUPP_CONF, networkInfo, { mode: 0o660 }, (err) => {
    if (err) {
      throw err;
    }
    let ps = require('child_process').spawnSync('ps');
    var procs = ps.stdout.toString().split('\n');
    for (var line of procs) {
      let m = new RegExp(PS_ENTRY_RX, 'm').exec(line);
      if (!m) {
        continue;
      }
      let entry = { pid: m[2], name: m[9] };
      if (/wpa_supplicant/.test(entry.name)) {
        console.log('Restarting wpa_supplicant; currently pid', entry.pid);
        spawnSync('kill', [ entry.pid ]);
        spawnSync('start', [ 'dhcpcd_wlan0' ]);
        return;
      }
    }
    // TODO: should we start wpa_supplicant or try to set a property
    // to start it?
    console.log('Warning: Unable to find wpa_supplicant; cannot kick wifi');
  });
}

function runConfigService(id, resolve, reject) {
  const STATE = api.btleConfigService.state;
  let configService = btle.configService();
  let updateRssiInterval = null;

  bleno.setServices([configService]);
  bleno.on('servicesSet', errServicesSet => {
    if (errServicesSet) {
      throw new Error(errServicesSet);
    }
    console.log(`Started BTLE config service for device ${id}`);

    // TODO: get name from build config
    bleno.startAdvertising('Silkcam', [configService.uuid],
                           err => err && console.log('Error: ' + err));
    bleno.on('advertisingStart', err => {
      if (err) {
        return reject(`runConfigService: ${err}`);
      }
      console.log('Started BTLE advertising');
    });
  });

  bleno.on('accept', clientAddr => {
    console.log('Accepted connection from', clientAddr);
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
    console.log('Client', clientAddr, 'disconnected');
    if (updateRssiInterval) {
      clearInterval(updateRssiInterval);
    }
  });

  configService.on('stateChange', state => {
    console.log('Configuration state is now', state);
    if (state !== STATE.REGISTERED) {
      return;
    }
    kickWifi(configService.ap,
             configService.unsecured ? '' : configService.secret);
    // TODO: write config info to persistent storage
    clearInterval(updateRssiInterval);
    bleno.stopAdvertising(() => {
      console.log('Stopped advertising.');
      resolve();
    });
  });
}

function configureDevice(id) {
  return new Promise((resolve, reject) => {
    console.log('Device not configured, launching BTLE config service ...');
    if (!caps.has('btle-peripheral')) {
      console.error('Device cannot do BTLE peripheral mode, skipping config service. You must configure wifi manually.');
      return resolve();
    }
    ui('setup');
    bleno = btle.bleno;
    runConfigService(id, resolve, reject);
  });
}

module.exports = configureDevice;
