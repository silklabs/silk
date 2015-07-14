/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let noble = require('noble');
let api = require('silk-api');
const decls = api.btleConfigService;

let ssid;
let psk;

const CURVE = 'curve25519';

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
  let stateChar, apChar, secretChar, curveChar, centralKeyChar, peripheralKeyChar;
  let central;

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
          decls.uuid.CurveCharacteristic,
          decls.uuid.CentralKeyCharacteristic,
          decls.uuid.PeripheralKeyCharacteristic,
        ],
        (err, services, characteristics) => {
          if (err) {
            console.log(`discover failed: ${err}`);
            peripheral.disconnect();
            return;
          }
          console.log('(peripheral discover)');

          // Fetch characterstic
          for (let i in characteristics) {
            let characteristic = characteristics[i];
            if (characteristic.uuid === decls.uuid.StateCharacteristic) {
              stateChar = characteristic;
            } else if (characteristic.uuid === decls.uuid.AccessPointCharacteristic) {
              apChar = characteristic;
            } else if (characteristic.uuid === decls.uuid.SecretCharacteristic) {
              secretChar = characteristic;
            } else if (characteristic.uuid === decls.uuid.CurveCharacteristic) {
              curveChar = characteristic;
            } else if (characteristic.uuid === decls.uuid.CentralKeyCharacteristic) {
              centralKeyChar = characteristic;
            } else if (characteristic.uuid === decls.uuid.PeripheralKeyCharacteristic) {
              peripheralKeyChar = characteristic;
            }
          }

          // Read the current device configuration state
          stateChar.read();
          stateChar.on('data', data => {
            if (data.length !== 1) {
              console.error(`Received invalid state from peripheral: ${data.length}`);
              peripheral.disconnect();
            } else {
              let state = data.readUInt8(0);
              switch (state) {
              case decls.state.UNREGISTERED:
                console.log(`Device is unregistered. Setting up crypto`);

                // Write Curve
                curveChar.write(new Buffer(CURVE, 'utf8'), true);
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

          // Read peripheral key
          curveChar.on('write', () => {
            console.log(`crypto: crypto written succesfully`);
            peripheralKeyChar.read();
          });

          // Write central key
          peripheralKeyChar.on('read', (data) => {
            console.log(`crypto: peripheral key read succesfully`);

            central = api.crypto.create(CURVE);
            let key = data.toString('binary');
            central.deriveShared(key);

            centralKeyChar.write(new Buffer(central.exportPublic(), 'binary'),
                true);
          });

          // Write SSID key
          centralKeyChar.on('write', () => {
            console.log(`crypto: central key written succesfully`);
            apChar.write(new Buffer(ssid), true);
          });

          // Write secret key
          apChar.on('write', () => {
            console.log(`AP key written successfully`);
            secretChar.write(new Buffer(psk), true);
          });

          secretChar.on('write', () => {
            console.log(`secret key written succesfully`);

            // Read the current device configuration state again to ensure it's
            // now registered.
            stateChar.read();
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
