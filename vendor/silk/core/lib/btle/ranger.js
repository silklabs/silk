/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import { getboolprop } from '../util';
import makeLog from '../log';

const log = makeLog('ranger');

const ENABLED_PROP = 'persist.silk.ranger.enabled';
const ENABLED = getboolprop(ENABLED_PROP);

// TODO: This should be unique to the each user's phone to enable individual
//       tracking.
const DEFAULT_LOCALNAME = 'Silk-app';
const DEFAULT_SERVICE_UUID = '699fec30-6fcb-4abe-a67e-591928ad01d0';

// Frequency at which range events will be emitted for each tracked peripheral.
const DEFAULT_EMIT_TIMEOUT_MS = 2000;

// Amount of elapsed time before we assume that a tracked peripheral has gone
// out of range.
const DEFAULT_OUT_OF_RANGE_TIMEOUT_MS = 10000;

// Frequency at which we flip the scanner on and off to work around broken BLE
// scans on some devices.
const DEFAULT_TOGGLE_SCAN_INTERVAL_MS = 500;

// Ranger is a component that listens for bluetooth traffic to notify us when a
// user is within bluetooth range and to estimate the distance between the user
// and the device.
//
// Ranger works by analyzing all bluetooth advertisement packets that the device
// can detect. It looks for devices that are advertising a known service uuid or
// an Apple iPhone that is advertising a special bit of manufaturer data that
// indicates services are available. Any device that does not meet these
// criteria is imediately blacklisted and never analyzed again. If the
// advertisement does meet these criteria then Ranger connects to the device to
// verify that the service we're looking for is actually present. If it is not
// then the device is blacklisted. If the service is present then Ranger
// disconnects and listens to the signal strength of the device's advertisement
// packets to estimate distance and will emit periodic updates on that distance.
// Ranger will also notify us once the device goes out of range.
//
// Unfortunately some devices (e.g. Nexus 4) don't report advertisement packets
// for the same device more than once. To get around this we toggle the scan on
// and off periodically...
export default class Ranger {
  constructor(events, noble, uuid = DEFAULT_SERVICE_UUID) {
    log.debug('Ranger()');

    if (!ENABLED) {
      return;
    }

    this.events = events;
    this.noble = noble;
    this.uuid = uuid.toLocaleLowerCase();
    this.emitInterval = DEFAULT_EMIT_TIMEOUT_MS;
    this.outOfRangeInterval = DEFAULT_OUT_OF_RANGE_TIMEOUT_MS;
    this.localName = DEFAULT_LOCALNAME;
    this.enabled = false;
    this.scanning = false;
    this.toggleScanTimeout = null;
    this.togglingScanListener = null;

    this.peripherals = new Map();

    this.blacklist = new Set();
    this.whitelist = new Set();
  }

  onDiscover(peripheral) {
    log.debug(`Discovered '%s'`, peripheral.uuid);

    let peripheralInfo = this.peripherals.get(peripheral.uuid);
    if (peripheralInfo) {
      if (this.whitelist.has(peripheral.uuid)) {
        this.updateRssi(peripheralInfo, peripheral.rssi);
      } else {
        peripheralInfo.rssiValues.push(peripheral.rssi);
      }
      return;
    }

    if (this.blacklist.has(peripheral.uuid)) {
      log.debug(`Ignoring '%s' because it is blacklisted`,
                peripheral.uuid);
      return;
    }

    if (this.whitelist.has(peripheral.uuid)) {
      log.debug(`Skipping connection to '%s' because it is whitelisted`,
                peripheral.uuid);
      peripheralInfo = this.createPeripheralInfo(peripheral);
      this.updateRssi(peripheralInfo, peripheral.rssi);
      return;
    }

    if (peripheral.state === 'connecting' ||
        peripheral.state === 'connected') {
      log.debug(`Skipping connection to '%s' because it is already %s`,
                peripheral.uuid,
                peripheral.state);
      return;
    }

    const localName = peripheral.advertisement.localName;
    const manufacturerData = peripheral.advertisement.manufacturerData;
    const serviceUuids = peripheral.advertisement.serviceUuids;

    if (localName !== this.localName &&
        serviceUuids.indexOf(this.uuid) === -1 &&
        !(manufacturerData &&
          manufacturerData.length > 3 &&
          manufacturerData[0] === 0x4c /* Apple LSB */ &&
          manufacturerData[1] === 0x00 /* Apple MSB */ &&
          manufacturerData[2] === 0x01 /* iPhone */)) {
      log.debug(`Blacklisting '%s' due to advertisement mismatch`,
                peripheral.uuid);
      this.blacklist.add(peripheral.uuid);
      return;
    }

    this.connect(peripheral);
  }

  adjustScanState() {
    log.debug('adjustScanState()');
    if (this.enabled) {
      log.info('Starting scan');

      const startScan = () => {
        this.noble.startScanning([ ], /* allowDuplicates */ true);
      };

      const toggle = () => {
        log.verbose('Toggling scan');

        this.togglingScanListener = () => {
          log.verbose('Toggling scan complete');
          this.togglingScanListener = null;

          if (this.enabled) {
            this.toggleScanTimeout =
              setTimeout(toggle, DEFAULT_TOGGLE_SCAN_INTERVAL_MS);
          }
        };

        this.noble.stopScanning();
        startScan();

        this.noble.once('scanStart', this.togglingScanListener);
      };

      startScan();
      this.noble.once('scanStart', error => {
        if (error) {
          log.error('Error starting scan: %s', error);
        } else {
          log.info('Started scanning');
          this.scanning = true;
          this.noble.on('discover', this.onDiscover.bind(this));
          this.toggleScanTimeout =
            setTimeout(toggle, DEFAULT_TOGGLE_SCAN_INTERVAL_MS);
        }

        log.debug(`Emitting 'region-start' event: '${error}'`);
        this.events.emit('region-start', error);

        // It's possible that we raced here. Check necessary conditions again
        // and maybe stop scanning now.
        if (!this.enabled) {
          this.adjustScanState();
        }
      });
    } else if (this.scanning) {
      log.info('Stopping scan');

      this.scanning = false;

      clearInterval(this.toggleScanTimeout);
      this.toggleScanTimeout = null;

      this.noble.removeListener('discover', this.onDiscover.bind(this));

      this.noble.stopScanning();
      this.noble.once('scanStop', () => {
        log.debug('Stopped scanning');
        if (!this.togglingScanListener) {
          log.debug(`Emitting 'region-stop' event`);
          this.events.emit('region-stop');
        }
      });
    }
  }

  createPeripheralInfo(peripheral) {
    assert(!this.peripherals.has(peripheral.uuid));

    const peripheralInfo = {
      peripheral: peripheral,
      inRange: false,
      rssiValues: [ ],
      connectTimeout: null,
      eventTimeout: null,
      outOfRangeTimeout: null,
    };

    this.peripherals.set(peripheral.uuid, peripheralInfo);

    return peripheralInfo;
  }

  connect(peripheral) {
    log.debug('connect(%s)', peripheral.uuid);

    const peripheralInfo = this.createPeripheralInfo(peripheral);

    const cleanup = () => {
      if (peripheralInfo.connectTimeout) {
        clearTimeout(peripheralInfo.connectTimeout);
        peripheralInfo.connectTimeout = null;
      }

      // We have to be really careful here about removing all the listeners that
      // are added because noble keeps its peripheral objects alive forever. If
      // we don't clean up here then we will add new listeners each time an
      // advertisement packet is received and we will get multiple callbacks.
      peripheral.removeListener('connect', connectHandler); // eslint-disable-line no-use-before-define
      peripheral.removeListener('servicesDiscover', servicesHandler); // eslint-disable-line no-use-before-define
      peripheral.removeListener('disconnect', disconnectHandler); // eslint-disable-line no-use-before-define

      peripheral.disconnect();
    };

    const abandon = () => {
      cleanup();
      this.peripherals.delete(peripheral.uuid);
    };

    const disconnectHandler = () => {
      log.debug(`Disconnected from '%s'`, peripheral.uuid);

      if (peripheralInfo.connectTimeout) {
        abandon();
      }
    };

    const servicesHandler = services => {
      log.debug(`Services discovered for peripheral '%s': %j`,
                peripheral.uuid,
                services.map(service => service.toString()));

      peripheralInfo.rssiValues.push(peripheral.rssi);

      for (let service of services) {
        if (service.uuid === this.uuid) {
          this.whitelist.add(peripheral.uuid);
          cleanup();

          this.updateRssi(peripheralInfo, peripheral.rssi);
          return;
        }
      }

      log.debug(`Peripheral '%s' does not support service`, peripheral.uuid);
      this.blacklist.add(peripheral.uuid);
      abandon();
    };

    const connectHandler = error => {
      if (error) {
        log.warn(`Error connecting to peripheral '%s': %s`,
                 peripheral.uuid,
                 error);
        abandon();
        return;
      }

      peripheralInfo.rssiValues.push(peripheral.rssi);

      log.debug(`Discovering services for '%s'`, peripheral.uuid);

      peripheral.discoverServices([ this.uuid ]);
      peripheral.once('servicesDiscover', servicesHandler);

      peripheral.once('disconnect', disconnectHandler);
    };

    peripheralInfo.connectTimeout = setTimeout(() => {
      if (peripheral.state === 'connected') {
        log.debug(`Timed out while discovering services for '%s'`,
                  peripheral.uuid);
      } else {
        log.debug(`Timed out while connecting to '%s'`, peripheral.uuid);
      }
      abandon();
    }, this.outOfRangeInterval);

    peripheral.connect();
    peripheral.once('connect', connectHandler);
  }

  resetOutOfRangeTimer(peripheralInfo) {
    const peripheral = peripheralInfo.peripheral;

    if (peripheralInfo.outOfRangeTimeout) {
      log.debug(`Resetting out-of-range timeout for peripheral '%s'`,
                peripheral.uuid);
      clearTimeout(peripheralInfo.outOfRangeTimeout);
    } else {
      log.debug(`Setting out-of-range timeout for peripheral '%s'`,
                peripheral.uuid);
    }

    peripheralInfo.outOfRangeTimeout = setTimeout(() => {
      log.debug(`Out-of-range timeout elapsed for peripheral '%s'`,
                peripheral.uuid);
      assert(this.peripherals.has(peripheral.uuid));
      assert(!peripheralInfo.eventTimeout);
      assert(!peripheralInfo.rssiValues.length);

      peripheralInfo.outOfRangeTimeout = null;

      this.peripherals.delete(peripheral.uuid);

      log.debug(`Emitting 'exited' event: '${peripheral.uuid}'`);
      this.events.emit('region-exited', peripheral.uuid);
    }, DEFAULT_OUT_OF_RANGE_TIMEOUT_MS);
  }

  updateRssi(peripheralInfo, rssi) {
    const peripheral = peripheralInfo.peripheral;
    log.debug('updateRssi(%s, %d)', peripheral.uuid, rssi);

    assert(this.whitelist.has(peripheral.uuid));

    peripheralInfo.rssiValues.push(rssi);
    this.resetOutOfRangeTimer(peripheralInfo);

    if (!peripheralInfo.eventTimeout) {
      log.debug(`Setting update timeout for peripheral '%s'`,
                peripheralInfo.peripheral.uuid);
      peripheralInfo.eventTimeout = setTimeout(() => {
        log.debug(`Update timeout elapsed for peripheral '%s'`,
                  peripheralInfo.peripheral.uuid);
        assert(peripheralInfo.rssiValues.length);

        peripheralInfo.eventTimeout = null;

        const rssiValues = peripheralInfo.rssiValues;
        peripheralInfo.rssiValues = [ ];

        const average = Math.round(rssiValues.reduce((a, b) => a + b) /
                                   rssiValues.length);

        if (!peripheralInfo.inRange) {
          peripheralInfo.inRange = true;
          log.debug(`Emitting 'region-entered' event: '${peripheral.uuid}', ` +
                    average);
          this.events.emit('region-entered', peripheral.uuid, average);
        }

        log.debug(`Emitting 'region-range' event: '${peripheral.uuid}', ${average}`);
        this.events.emit('region-range', peripheral.uuid, average);
      }, this.emitInterval);
    }
  }

  async start() {
    log.debug('start()');

    if (!ENABLED) {
      log.info(`Not starting because '${ENABLED_PROP}' property is not set'`);
      return;
    }

    if (!this.enabled) {
      assert(!this.peripherals.size);
      this.enabled = true;

      this.adjustScanState();

      await new Promise((resolve, reject) => {
        this.events.once('region-start', err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  }

  async stop() {
    log.debug('stop()');

    if (!ENABLED) {
      return;
    }

    if (this.enabled) {
      this.enabled = false;

      const wasScanning = this.scanning;
      if (wasScanning) {
        if (this.togglingScanListener) {
          this.noble.removeListener('scanStart', this.togglingScanListener);
          this.togglingScanListener = null;
        }

        this.adjustScanState();
      }

      if (this.peripherals.size) {
        this.peripherals.forEach(peripheralInfo => {
          clearTimeout(peripheralInfo.connectTimeout);
          clearTimeout(peripheralInfo.eventTimeout);
          clearTimeout(peripheralInfo.outOfRangeTimeout);

          const peripheral = peripheralInfo.peripheral;
          peripheral.disconnect();

          if (peripheralInfo.inRange) {
            log.debug(`Emitting 'region-exited' event: '${peripheral.uuid}'`);
            this.events.emit('region-exited', peripheral.uuid);
          }
        });
        this.peripherals.clear();
      }

      if (wasScanning) {
        await new Promise(resolve => {
          this.events.once('region-stop', () => {
            resolve();
          });
        });
      }
    }
  }
}
