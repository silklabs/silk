/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let noble = require('noble');
let api = require('../api');
let log = require('../log')('scanner');
const decls = api.btleConfigService;

let ssid;
let psk;

const CURVE = 'curve25519';

function startScanning() {
  log.info(`Scanning for unregistered SilkCams...`);
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

class ReadRssi {
  constructor(_peripheral) {
    this.peripheral = _peripheral;
    this.updateRssiInterval = setTimeout(() => this._start(), 500);
  }

  _start() {
    this.peripheral.once('rssiUpdate', (rssi) => {
      log.info('rssi: ' + rssi);

      if (this.updateRssiInterval) {
        clearInterval(this.updateRssiInterval);
        this.updateRssiInterval = setTimeout(() => this._start(), 500);
      }
    });
    this.peripheral.updateRssi();
  }

  stop() {
    if (this.updateRssiInterval) {
      clearInterval(this.updateRssiInterval);
      this.updateRssiInterval = null;
      this.peripheral.removeAllListeners('rssiUpdate');
    }
  }
}

noble.on('warning', msg => log.warn(`Noble Warning: ${msg}`));

noble.on('discover', peripheral => {
  let uuids = peripheral.advertisement.serviceUuids;
  let stateChar, apChar, secretChar, curveChar, centralKeyChar, peripheralKeyChar;
  let central;
  let readRssi;

  if (uuids.indexOf(decls.uuid.ConfigService) !== -1) {
    let name = peripheral.advertisement.localName;
    let rssi = peripheral.rssi;

    log.debug(`discover: ${name} with [${uuids}] (rssi: ${rssi})`);

    peripheral.on('connect', function() {
      log.debug('(peripheral connect)');

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
            log.debug(`discover failed: ${err}`);
            peripheral.disconnect();
            return;
          }
          log.debug('(peripheral discover)');

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

          // Read rssi at regular intervals
          readRssi = new ReadRssi(peripheral);

          // Read the current device configuration state
          stateChar.read();
          stateChar.on('data', data => {
            if (data.length !== 1) {
              log.error(`Received invalid state from peripheral: ${data.length}`);
              peripheral.disconnect();
            } else {
              let state = data.readUInt8(0);
              switch (state) {
              case decls.state.UNREGISTERED:
                log.info(`Device is unregistered. Setting up crypto`);

                // Write Curve
                curveChar.write(new Buffer(CURVE, 'utf8'), true);
                break;
              case decls.state.REGISTERED:
                log.info(`Device is registered, disconnecting.`);

                // Stop reading rssi
                if (readRssi) {
                  readRssi.stop();
                  readRssi = null;
                }

                peripheral.disconnect();
                break;
              default:
                log.error(`Error: device is in state ${state}, disconnecting.`);
                peripheral.disconnect();
                break;
              }
            }
          });

          // Read peripheral key
          curveChar.on('write', () => {
            log.info(`crypto: crypto written succesfully`);
            log.info(`Waiting for proximity sensor to trigger`);
            log.info(`***Bring the device closer to this machine`);
            peripheralKeyChar.read();
          });

          // Write central key
          peripheralKeyChar.on('read', (data) => {
            log.info(`crypto: peripheral key read succesfully`);

            central = api.crypto.create(CURVE);
            let key = data.toString('binary');
            central.deriveShared(key);

            centralKeyChar.write(new Buffer(central.exportPublic(), 'binary'),
                true);
          });

          // Write SSID key
          centralKeyChar.on('write', () => {
            log.info(`crypto: central key written succesfully`);
            central.encrypt(ssid)
            .then(cipherText => {
              apChar.write(new Buffer(cipherText, 'utf8'), true);
            });
          });

          // Write secret key
          apChar.on('write', () => {
            log.info(`AP key written successfully`);
            central.encrypt(psk)
            .then(cipherText => {
              secretChar.write(new Buffer(cipherText, 'utf8'), true);
            });
          });

          secretChar.on('write', () => {
            log.info(`secret key written succesfully`);

            // Read the current device configuration state again to ensure it's
            // now registered.
            stateChar.read();
          });
        }
      );
    });

    peripheral.on('disconnect', function() {
      log.info('(peripheral disconnect)');
      startScanning();
    });

    noble.stopScanning();
    peripheral.connect();
  }
});

if (require.main === module) {
  if (process.argv.length !== 4) {
    log.error('Wifi SSID and PSK not provided');
    process.exit(1); //eslint-disable-line no-process-exit
  }
  let [,, _ssid, _psk] = process.argv;
  start(_ssid, _psk);
}
