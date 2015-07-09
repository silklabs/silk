/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let noble = require('noble');
let api = require('silk-api');
const decls = api.btleConfigService;

let ssid;
let psk;

function startScanning() {
  console.log(`Scanning for unregistered SilkCams...`);
  noble.startScanning([decls.uuid.ConfigService], true);
}

export function start(_ssid, _psk) {
  ssid = _ssid;
  psk = _psk;

  noble.on('stateChange', state => {
    if (state === 'poweredOn') {
      startScanning();
    } else {
      noble.stopScanning();
    }
  });
}

noble.on('warning', msg => console.warning(`Noble Warning: ${msg}`));

noble.on('discover', peripheral => {
  let uuids = peripheral.advertisement.serviceUuids;

  if (uuids.indexOf(decls.uuid.ConfigService) !== -1) {
    let name = peripheral.advertisement.localName;
    let rssi = peripheral.rssi;

    console.log(`discover: ${name} with [${uuids}] (rssi: ${rssi})`);

    peripheral.on('connect', function() {
      console.log('(peripheral connect)');

      peripheral.discoverSomeServicesAndCharacteristics(
        [ decls.uuid.ConfigService ],
        [
          decls.uuid.StateCharacteristic,
          decls.uuid.AccessPointCharacteristic,
          decls.uuid.SecretCharacteristic,
        ],
        (err, services, characteristics) => {
          if (err) {
            console.log(`discover failed: ${err}`);
            peripheral.disconnect();
            return;
          }
          console.log('(peripheral discover)');

          let [stateChar, apChar, secretChar] = characteristics;

          // Read the current device configuration state
          noble.read(
            peripheral.uuid,
            decls.uuid.ConfigService,
            stateChar.uuid
          );

          stateChar.on('data', data => {
            if (data.length !== 1) {
              console.error(`Received invalid state from peripheral: ${data.length}`);
              peripheral.disconnect();
            } else {
              let state = data.readUInt8(0);
              switch (state) {
              case decls.state.UNREGISTERED:
                console.log(`Device is unregistered. Sending it SSID/PSK`);
                noble.write(
                  peripheral.uuid,
                  decls.uuid.ConfigService,
                  apChar.uuid,
                  new Buffer(ssid)
                );
                break;
              case decls.state.REGISTERED:
                console.log(`Device is registered, disconnecting.`);
                peripheral.disconnect();
                break;
              default:
                console.error(`Error: device is in state ${state}, disconnecting.`);
                peripheral.disconnect();
                break;
              }
            }

          });

          apChar.on('write', () => {
            noble.write(
              peripheral.uuid,
              decls.uuid.ConfigService,
              secretChar.uuid,
              new Buffer(psk)
            );
          });

          secretChar.on('write', () => {
            // Read the current device configuration state again to ensure it's
            // now registered.
            noble.read(
              peripheral.uuid,
              decls.uuid.ConfigService,
              stateChar.uuid
            );

          });

        }
      );
    });

    peripheral.on('disconnect', function() {
      console.log('(peripheral disconnect)');
      startScanning();
    });

    noble.stopScanning();
    peripheral.connect();
  }
});


if (require.main === module) {
  if (process.argv.length !== 4) {
    console.error('Wifi SSID and PSK not provided');
    process.exit(1); //eslint-disable-line no-process-exit
  }
  let [,, _ssid, _psk] = process.argv;
  start(_ssid, _psk);
}
