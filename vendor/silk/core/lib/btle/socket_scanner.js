/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import { BTLE_SOCKET_UUIDS } from 'silk-api';
import { EventEmitter } from 'events';
import makeLog from '../log';
import SocketSession from './socket_session';

const log = makeLog(`btle-socketscanner`);

const DEFAULT_LOCALNAME = `Silk-app`;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;

export default class SocketScanner extends EventEmitter {
  _noble = null;
  _localName = DEFAULT_LOCALNAME;
  _serviceUuid = BTLE_SOCKET_UUIDS.service;
  _enabled = false;
  _scanning = false;
  _scanPromise = Promise.resolve();
  _timeout = null;
  _blackList = new Set();
  _skipList = new Set();

  _connectionQueue = [];
  _connectionMap = new Map();

  constructor(noble, options = { }) {
    log.debug(`SocketScanner(%j)`);

    super();

    this._noble = noble;

    if (`serviceUuid` in options) {
      this._serviceUuid = options.serviceUuid;
    }
    if (`localName` in options) {
      this._localName = options.localName;
    }
  }

  _onDiscover = async peripheral => {
    if (!this._enabled) {
      return;
    }

    log.debug(`Discovered '%s'`, peripheral.uuid);

    if (peripheral.state !== `disconnected` && peripheral.state !== `error`) {
      log.debug(`Ignoring '${peripheral.uuid}' because its state is ` +
                `'${peripheral.state}'`);
      return;
    }

    if (this._skipList.has(peripheral.uuid)) {
      log.debug(`Ignoring '${peripheral.uuid}' because it is marked to skip`);
      return;
    }

    const localName = peripheral.advertisement.localName;
    const hasService =
      peripheral.advertisement.serviceUuids.indexOf(this._serviceUuid) !== -1;
    const manufacturerData = peripheral.advertisement.manufacturerData;

    if (this._blackList.has(peripheral.uuid)) {
      if (localName !== this._localName && !hasService) {
        log.debug(`Ignoring '${peripheral.uuid}' because it is blacklisted`);
        return;
      }

      log.debug(`Previously blacklisted peripheral '${peripheral.uuid}' now ` +
                `advertising our service, removing from blacklist`);
      this._blackList.delete(peripheral.uuid);
    } else if (localName !== this._localName &&
               !hasService &&
               !(manufacturerData &&
                 manufacturerData.length > 3 &&
                 manufacturerData[0] === 0x4c /* Apple LSB */ &&
                 manufacturerData[1] === 0x00 /* Apple MSB */ &&
                 manufacturerData[2] === 0x01 /* iPhone */)) {
      log.debug(`Blacklisting '${peripheral.uuid}' due to advertisement ` +
                `mismatch`);
      this._blackList.add(peripheral.uuid);
      return;
    }

    let queueInfo = this._connectionMap.get(peripheral.uuid);
    if (queueInfo) {
      queueInfo.averageRssi = (queueInfo.averageRssi + peripheral.rssi) / 2;
    } else {
      queueInfo = {
        averageRssi: peripheral.rssi,
        peripheral
      };
      this._connectionQueue.push(queueInfo);
      this._connectionMap.set(peripheral.uuid, queueInfo);

      if (this._connectionQueue.length === 1) {
        this._attemptNextConnection();
      }
    }
  };

  async _startScan() {
    log.debug(`_startScan()`);
    assert(this._enabled);

    try {
      await this._scanPromise;
    } catch(error) {                             // eslint-disable-line no-empty
      // Assume error is already reported.
    }

    if (!this._enabled || this._scanning) {
      return;
    }

    this._scanPromise = new Promise((resolve, reject) => {
      this._noble.startScanning([ ], true, function (error) {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    await this._scanPromise;

    this._noble.addListener(`discover`, this._onDiscover);
    this._scanning = true;
  }

  async _stopScan() {
    log.debug(`_stopScan()`);

    try {
      await this._scanPromise;
    } catch(error) {                             // eslint-disable-line no-empty
      // Assume error is already reported.
    }

    if (!this._scanning) {
      return;
    }

    this._noble.removeListener(`discover`, this._onDiscover);
    this._scanning = false;

    this._scanPromise = new Promise((resolve, reject) => {
      this._noble.stopScanning(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    await this._scanPromise;
  }

  async _waitForEventWithTimeout(emitter, eventName, start, stop, errorString) {
    assert(this._enabled);

    return await new Promise((resolve, reject) => {
      let timeout = null;

      const listener = results => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        emitter.removeListener(eventName, listener);
        resolve(results);
      };

      timeout = setTimeout(() => {
        stop();
        emitter.removeListener(eventName, listener);
        reject(new Error(errorString));
      }, DEFAULT_CONNECTION_TIMEOUT_MS);

      emitter.addListener(eventName, listener);
      start();
    });
  }

  async _connect(peripheral) {
    log.debug(`_connect('${peripheral.uuid}'`);

    let error = await this._waitForEventWithTimeout(
      peripheral,
      `connect`,
      () => peripheral.connect(),
      () => peripheral.disconnect(),
      `Timed out connecting to '${peripheral.uuid}'`);
    if (error) {
      throw error;
    }
  }

  async _discoverServices(peripheral) {
    log.debug(`_discoverServices('${peripheral.uuid}'`);

    return await this._waitForEventWithTimeout(
      peripheral,
      `servicesDiscover`,
      () => peripheral.discoverServices([ this._serviceUuid ]),
      () => peripheral.disconnect(),
      `Timed out discovering services for '${peripheral.uuid}'`);
  }

  async _discoverCharacteristics(peripheral, service) {
    log.debug(`_discoverCharacteristics('${peripheral.uuid}', ` +
              `'${service.uuid}')`);

    return await this._waitForEventWithTimeout(
      service,
      `characteristicsDiscover`,
      () => service.discoverCharacteristics([BTLE_SOCKET_UUIDS.characteristic]),
      () => peripheral.disconnect(),
      `Timed out discovering characteristics for '${peripheral.uuid}'`);
  }

  async _discoverDescriptors(peripheral, characteristic) {
    log.debug(`_discoverDescriptors('${peripheral.uuid}', ` +
              `'${characteristic.uuid}')`);

    return await this._waitForEventWithTimeout(
      characteristic,
      `descriptorsDiscover`,
      () => characteristic.discoverDescriptors(),
      () => peripheral.disconnect(),
      `Timed out discovering descriptors for '${peripheral.uuid}'`);
  }

  async _attemptNextConnection() {
    log.debug(`_attemptNextConnection(): ${this._connectionQueue.length}`);

    if (!this._enabled || !this._connectionQueue.length) {
      return;
    }

    this._connectionQueue.sort((a, b) => {
      if (a.averageRssi === b.averageRssi) {
        return 0;
      }
      // Rssi is negative and closer to 0 means stronger signal.
      return (a.averageRssi < b.averageRssi) ? 1 : -1;
    });

    const peripheral = this._connectionQueue[0].peripheral;
    const connected = await this._attemptConnection(peripheral);

    this._connectionMap.delete(peripheral.uuid);
    this._connectionQueue.shift();

    if (connected) {
      assert(peripheral.state === `connected`);

      await this._stopScan();
      this._connectionQueue = [ ];
      this._connectionMap.clear();

      // It's possible that the device disconnected while waiting for the scan
      // to stop, so make sure it's still connected.
      if (peripheral.state === `connected`) {
        // Make sure we restart scanning when the session ends.
        const session = new SocketSession(this, peripheral, this._serviceUuid);
        session.once(`close`, async () => {
          log.debug(`Session closed`);
          if (this._enabled) {
            try {
              await this._startScan();
            } catch(error) {
              log.warn(error);
            }
          }
        });

        this.emit(`connect`, session);
      } else {
        await this._startScan();
      }
    } else {
      peripheral.disconnect();
    }

    this._attemptNextConnection();
  }

  async _attemptConnection(peripheral) {
    log.debug(`_attemptConnection('${peripheral.uuid}')`);

    const closure = {
      peripheral,
      disconnected: false
    };
    let disconnectListener;

    const eventName = `disconnect`;
    const cleanupListener = () => {
      peripheral.removeListener(eventName, disconnectListener);
    };
    disconnectListener = () => {
      log.info(`Peripheral '${peripheral.uuid}' disconnected while ` +
               `attempting to connect`);
      cleanupListener();
      closure.disconnected = true;
    };
    peripheral.addListener(eventName, disconnectListener);

    let result;
    try {
      result = await this._attemptConnectionInternal(closure);
    } catch(error) {
      log.warn(error.toString());
      result = false;
    }

    cleanupListener();

    return result;
  }

  async _attemptConnectionInternal(closure) {
    const { peripheral } = closure;
    log.info(`Attempting to connect to peripheral '${peripheral.uuid}'`);

    await this._connect(peripheral);
    if (!this._enabled || closure.disconnected) {
      return false;
    }

    const services = await this._discoverServices(peripheral);
    if (!this._enabled || closure.disconnected) {
      return false;
    }

    const socketService =
      services.find(service => service.uuid === this._serviceUuid, this);
    if (!socketService) {
      log.info(`Peripheral '${peripheral.uuid}' does not provide ` +
               `socket service`);
      this._blackList.add(peripheral.uuid);
      return false;
    }

    const characteristics =
      await this._discoverCharacteristics(peripheral, socketService);
    if (!this._enabled || closure.disconnected) {
      return false;
    }

    const socketCharacteristic =
      characteristics.find(char => char.uuid === BTLE_SOCKET_UUIDS.characteristic);
    if (!socketCharacteristic) {
      log.info(`Peripheral '${peripheral.uuid}' does not provide socket ` +
               `characteristic`);
      this._blackList.add(peripheral.uuid);
      return false;
    }

    await this._discoverDescriptors(peripheral, socketCharacteristic);
    if (!this._enabled || closure.disconnected) {
      return false;
    }

    return true;
  }

  async start() {
    log.debug('start()');

    if (!this._enabled) {
      this._enabled = true;
      await this._startScan();
    }
  }

  async stop() {
    log.debug('stop()');

    if (this._enabled) {
      this._enabled = false;
      await this._stopScan();
    }
  }

  addToSkipList(peripheral) {
    log.debug(`addToSkipList('${peripheral.uuid}')`);

    if (!this._skipList.has(peripheral.uuid)) {
      this._skipList.add(peripheral.uuid);
    }
  }

  removeFromSkipList(peripheral) {
    log.debug(`removeFromSkipList('${peripheral.uuid}')`);

    this._skipList.delete(peripheral.uuid);
  }

  clearSkipList() {
    log.debug(`clearSkipList()`);

    this._skipList.clear();
  }
}
