/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import { getintprop } from '../sysutils';
import invariant from 'assert';
import { BTLE_SOCKET_UUIDS } from 'silk-api';
import { EventEmitter } from 'events';
import makeLog from '../log';

import type { Noble, Peripheral, Characteristic, Service } from 'noble';

type ConnectionInfo = {
  averageRssi: number;
  peripheral: Peripheral;
};
type ScannerOptions = { // eslint-disable-line no-unused-vars
  publicKeys?: Array<string>;
  serviceUuid?: string;
  localName?: string;
};
type PeripheralState = {
  peripheral: Peripheral;
  disconnected: boolean;
};

const log = makeLog(`btle-socketscanner`);

const DEFAULT_LOCALNAME = `Silk-app`;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;

const SCAN_DURATION_OVERRIDE_MS =
  getintprop(`persist.silk.bt.socket.scandur`, 0);
const SCAN_DURATION_MS =
  SCAN_DURATION_OVERRIDE_MS > 0 ?
  SCAN_DURATION_OVERRIDE_MS :
  getintprop(`ro.silk.bt.socket.scan_dur_ms`, 2000);

const SCAN_INTERVAL_OVERRIDE_MS =
  getintprop(`persist.silk.bt.socket.scanint`, 0);
const SCAN_INTERVAL_MS =
  SCAN_INTERVAL_OVERRIDE_MS > 0 ?
  SCAN_INTERVAL_OVERRIDE_MS :
  getintprop(`ro.silk.bt.socket.scan_int_ms`, 500);

const MAX_SIMULTANEOUS_CONNECTIONS_OVERRIDE =
  getintprop(`persist.silk.bt.socket.max`, 0);
const MAX_SIMULTANEOUS_CONNECTIONS =
  MAX_SIMULTANEOUS_CONNECTIONS_OVERRIDE > 0 ?
  MAX_SIMULTANEOUS_CONNECTIONS_OVERRIDE :
  getintprop(`ro.silk.bt.socket.max_simul`, 1);

export default class SocketScanner extends EventEmitter {

  _noble: Noble;
  _privateKey: string;
  _publicKeys: Array<string> = [];
  _localName: string = DEFAULT_LOCALNAME;
  _serviceUuid: string = BTLE_SOCKET_UUIDS.service;
  _enabled: boolean = false;
  _scanPromise: Promise<void> = Promise.resolve();
  _timeout: ?number = null;
  _blackList: Set<string> = new Set();
  _skipList: Set<string> = new Set();
  _toggled: boolean = false;

  _connectionQueue: Array<ConnectionInfo> = [];
  _connectionMap: Map<string, ConnectionInfo> = new Map();
  _connectionsInProgress: Array<ConnectionInfo> = [];

  constructor(noble: Noble, privateKey: string, options?: ScannerOptions = {}) {
    log.debug(`SocketScanner()`);

    invariant(noble);
    invariant(privateKey);

    super();

    this._noble = noble;
    this._privateKey = privateKey;

    if (options.publicKeys) {
      this._publicKeys = options.publicKeys;
    }
    if (options.serviceUuid) {
      this._serviceUuid =
        options.serviceUuid.toLowerCase().replace(/[^\da-f]/g, '');
    }
    if (options.localName) {
      this._localName = options.localName;
    }
  }

  _waitForEventWithTimeout(
    peripheral: ?Peripheral,
    emitter: EventEmitter,
    eventName: string,
    start: () => void,
    stop: () => void,
    errorString: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let disconnectListener;
      let eventListener;
      let timeout;

      const disconnectName = `disconnect`;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (peripheral) {
          peripheral.removeListener(disconnectName, disconnectListener);
        }
        emitter.removeListener(eventName, eventListener);
      };

      disconnectListener = () => {
        cleanup();
        reject(new Error(`Peripheral disconnected while ${errorString}`));
      };

      eventListener = results => {
        cleanup();
        resolve(results);
      };

      timeout = setTimeout(() => {
        cleanup();
        stop();
        reject(new Error(`Timed out while ${errorString}`));
      }, DEFAULT_CONNECTION_TIMEOUT_MS);

      if (peripheral) {
        peripheral.addListener(disconnectName, disconnectListener);
      }
      emitter.addListener(eventName, eventListener);
      start();
    });
  }

  get _scanning(): boolean {
    return !!this._timeout;
  }

  _onDiscover: ((peripheral: Peripheral) => Promise<void>) = async (peripheral) => {
    log.debug(`_onDiscover('${peripheral.uuid}')`);

    invariant(this._scanning);

    if (!this._enabled) {
      log.debug(`No longer enabled`);
      return;
    }

    if (peripheral.state !== `disconnected` && peripheral.state !== `error`) {
      log.debug(`Ignoring peripheral '${peripheral.uuid}' because its state ` +
                `is '${peripheral.state}'`);
      return;
    }

    if (this._skipList.has(peripheral.uuid)) {
      log.debug(`Ignoring peripheral '${peripheral.uuid}' because it is ` +
                `marked to skip`);
      return;
    }

    const localName = peripheral.advertisement.localName;
    const hasService =
      peripheral.advertisement.serviceUuids.indexOf(this._serviceUuid) !== -1;
    const manufacturerData = peripheral.advertisement.manufacturerData;

    if (this._blackList.has(peripheral.uuid)) {
      if (localName !== this._localName && !hasService) {
        log.debug(`Ignoring peripheral '${peripheral.uuid}' because it is ` +
                  `blacklisted`);
        return;
      }

      log.info(`Previously blacklisted peripheral '${peripheral.uuid}' now ` +
               `advertising our service, removing from blacklist`);
      this._blackList.delete(peripheral.uuid);
    } else if (localName !== this._localName &&
               !hasService &&
               !(manufacturerData &&
                 manufacturerData.length > 3 &&
                 manufacturerData[0] === 0x4c /* Apple LSB */ &&
                 manufacturerData[1] === 0x00 /* Apple MSB */ &&
                 manufacturerData[2] === 0x01 /* iPhone */)) {
      log.debug(`Blacklisting peripheral '${peripheral.uuid}' due to ` +
                `advertisement mismatch`);
      this._blackList.add(peripheral.uuid);
      return;
    }

    let queueInfo = this._connectionMap.get(peripheral.uuid);
    if (queueInfo) {
      queueInfo.averageRssi = (queueInfo.averageRssi + peripheral.rssi) / 2;
    } else {
      queueInfo = {
        averageRssi: peripheral.rssi,
        peripheral,
      };
      this._connectionQueue.push(queueInfo);
      this._connectionMap.set(peripheral.uuid, queueInfo);
    }

    if (this._connectionQueue.length &&
        this._connectionsInProgress.length < MAX_SIMULTANEOUS_CONNECTIONS) {
      this._attemptMoreConnections();
    }
  };

  _nobleStartScan(): Promise<void> {
    const noble = this._noble;
    return this._waitForEventWithTimeout(
      null,
      noble,
      `scanStart`,
      () => noble.startScanning([], true),
      () => undefined,
      `starting scan`
    );
  }

  _nobleStopScan(): Promise<void> {
    const noble = this._noble;
    return this._waitForEventWithTimeout(
      null,
      noble,
      `scanStop`,
      () => noble.stopScanning(),
      () => undefined,
      `stopping scan`
    );
  }

  async _startScan(): Promise<void> {
    log.debug(`_startScan()`);
    invariant(this._enabled);

    try {
      await this._scanPromise;
    } catch(error) {                             // eslint-disable-line no-empty
      // Assume error is already reported.
    }

    if (!this._enabled || this._scanning) {
      return;
    }

    invariant(!this._toggled);

    this._scanPromise = this._nobleStartScan();
    await this._scanPromise;

    log.debug(`Scanning started`);

    log.debug(`Setting toggle duration timer`);
    this._timeout = setTimeout(() => this._toggleScan(), SCAN_DURATION_MS);

    this._noble.addListener(`discover`, this._onDiscover);
  }

  async _stopScan(): Promise<void> {
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

    log.debug(`Clearing toggle timer`);
    clearTimeout(this._timeout);
    this._timeout = null;

    if (this._toggled) {
      this._toggled = false;
    } else {
      this._scanPromise = this._nobleStopScan();
      await this._scanPromise;
    }

    log.debug(`Scan stopped`);
  }

  async _toggleScan(): Promise<void> {
    log.debug(`_toggleScan()`);

    invariant(this._scanning);

    if (!this._enabled) {
      log.debug(`No longer enabled`);
      return;
    }

    const timeoutOff = this._timeout;
    invariant(timeoutOff);

    invariant(!this._toggled);
    this._toggled = true;

    log.debug(`Toggling scan off`);
    try {
      await this._nobleStopScan();
    } catch(error) {
      if (this._timeout !== timeoutOff &&
          error.message.startsWith(`Timed out`)) {
        log.debug(`Other timeout activity while toggling scan off`);
        return;
      }
      throw error;
    }

    log.debug(`Scan toggled off`);

    if (!this._enabled) {
      log.debug(`No longer enabled`);
      return;
    }

    if (this._timeout !== timeoutOff) {
      log.debug(`Other timeout activity, bailing`);
      return;
    }

    log.debug(`Setting toggle interval timer`);

    this._timeout = setTimeout(async () => {
      log.debug(`Interval timer expired`);

      invariant(this._scanning);

      if (!this._enabled) {
        log.debug(`No longer enabled`);
        return;
      }

      const timeoutOn = this._timeout;
      invariant(timeoutOn);

      invariant(this._toggled);
      this._toggled = false;

      log.debug(`Toggling scan on`);
      try {
        await this._nobleStartScan();
      } catch(error) {
        if (this._timeout !== timeoutOff &&
            error.message.startsWith(`Timed out`)) {
          log.debug(`Other timeout activity while toggling scan on`);
          return;
        }
        throw error;
      }

      log.debug(`Scan toggled on`);

      if (!this._enabled) {
        log.debug(`No longer enabled`);
        return;
      }

      if (this._timeout !== timeoutOn) {
        log.debug(`Other timeout activity, bailing`);
        return;
      }

      log.debug(`Setting toggle duration timer`);
      this._timeout = setTimeout(() => this._toggleScan(), SCAN_DURATION_MS);
    }, SCAN_INTERVAL_MS);
  }

  async _connect(peripheral: Peripheral): Promise<void> {
    log.debug(`_connect('${peripheral.uuid}'`);

    let error = await this._waitForEventWithTimeout(
      peripheral,
      peripheral,
      `connect`,
      () => peripheral.connect(),
      () => peripheral.disconnect(),
      `connecting to peripheral '${peripheral.uuid}'`
    );
    if (error) {
      throw error;
    }
  }

  _discoverServices(peripheral: Peripheral): Promise<Array<Service>> {
    log.debug(`_discoverServices('${peripheral.uuid}'`);

    return this._waitForEventWithTimeout(
      peripheral,
      peripheral,
      `servicesDiscover`,
      () => peripheral.discoverServices([ this._serviceUuid ]),
      () => peripheral.disconnect(),
      `discovering services for peripheral '${peripheral.uuid}'`
    );
  }

  _discoverCharacteristics(
    peripheral: Peripheral,
    service: Service
  ): Promise<Array<Characteristic>> {
    log.debug(`_discoverCharacteristics('${peripheral.uuid}', ` +
              `'${service.uuid}')`);

    return this._waitForEventWithTimeout(
      peripheral,
      service,
      `characteristicsDiscover`,
      () => service.discoverCharacteristics([
        BTLE_SOCKET_UUIDS.read,
        BTLE_SOCKET_UUIDS.write,
      ]),
      () => peripheral.disconnect(),
      `discovering characteristics for peripheral '${peripheral.uuid}'`
    );
  }

  _discoverDescriptors(
    peripheral: Peripheral,
    characteristic: Characteristic
  ): Promise<void> {
    log.debug(`_discoverDescriptors('${peripheral.uuid}', ` +
              `'${characteristic.uuid}')`);

    return this._waitForEventWithTimeout(
      peripheral,
      characteristic,
      `descriptorsDiscover`,
      () => characteristic.discoverDescriptors(),
      () => peripheral.disconnect(),
      `discovering descriptors for peripheral '${peripheral.uuid}'`
    );
  }

  _attemptMoreConnections(): void {
    log.debug(`_attemptMoreConnections(): ${this._connectionQueue.length}`);

    if (!this._enabled) {
      log.debug(`No longer enabled`);
      return;
    }

    if (!this._connectionQueue.length) {
      log.debug(`No peripherals to connect`);
      return;
    }

    if (this._connectionsInProgress.length >= MAX_SIMULTANEOUS_CONNECTIONS) {
      log.info(`Reached maximum number of simultaneous connections`);
      return;
    }

    this._connectionQueue.sort((a, b) => {
      if (a.averageRssi === b.averageRssi) {
        return 0;
      }
      // Rssi is negative and closer to 0 means stronger signal.
      return (a.averageRssi < b.averageRssi) ? 1 : -1;
    });

    // Figure out how many connections we're going to start here.
    const maxNewConnections =
      Math.min(this._connectionQueue.length, MAX_SIMULTANEOUS_CONNECTIONS);

    // Pull the new connections out of the queue.
    const connections = this._connectionQueue.splice(0, maxNewConnections);

    // And put them into the in-progress list.
    this._connectionsInProgress.push(...connections);

    // Then start each one.
    for (let connectionInfo of connections) {
      this._attemptConnection(connectionInfo);
    }
  }

  async _attemptConnection(connectionInfo: ConnectionInfo): Promise<void> {
    const { peripheral } = connectionInfo;
    log.debug(`_attemptConnection('${peripheral.uuid}')`);

    invariant(this._connectionQueue.indexOf(connectionInfo) === -1);
    invariant(this._connectionsInProgress.indexOf(connectionInfo) > -1);

    const closure: PeripheralState = {
      peripheral,
      disconnected: false,
    };
    let disconnectListener;

    const eventName = `disconnect`;
    disconnectListener = () => {
      log.info(`Peripheral '${peripheral.uuid}' disconnected while ` +
               `attempting to connect`);
      peripheral.removeListener(eventName, disconnectListener);
      closure.disconnected = true;
    };
    peripheral.addListener(eventName, disconnectListener);

    let connected;
    try {
      connected = await this._attemptConnectionInternal(closure) &&
                  this._enabled &&
                  !closure.disconnected;
    } catch(error) {
      log.warn(error);
      connected = false;
    }

    peripheral.removeListener(eventName, disconnectListener);

    if (connected) {
      invariant(peripheral.state === `connected`);

      peripheral.once(`disconnect`, () => {
        this._onDisconnect(connectionInfo);
      });

      this.emit(`discover`, peripheral);
    } else {
      // Make sure we clean up.
      process.nextTick(() => this._onDisconnect(connectionInfo));

      if (peripheral.state !== `disconnected`) {
        peripheral.disconnect();
      }
    }

    this._attemptMoreConnections();
  }

  async _attemptConnectionInternal(closure: PeripheralState): Promise<boolean> {
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

    const serviceUuid = this._serviceUuid;

    const socketService =
      services.find((service) => service.uuid.toLowerCase() === serviceUuid);
    if (!socketService) {
      log.info(`Peripheral '${peripheral.uuid}' does not provide ` +
               `socket service '${this._serviceUuid}'`);
      this._blackList.add(peripheral.uuid);
      return false;
    }

    const characteristics =
      await this._discoverCharacteristics(peripheral, socketService);
    if (!this._enabled || closure.disconnected) {
      return false;
    }

    const readCharacteristic = characteristics.find(
      (char) => char.uuid.toLowerCase() === BTLE_SOCKET_UUIDS.read);
    if (!readCharacteristic ||
        readCharacteristic.properties.indexOf(`notify`) === -1 ||
        readCharacteristic.properties.indexOf(`read`) === -1 ||
        readCharacteristic.properties.indexOf(`write`) === -1) {
      log.info(`Peripheral '${peripheral.uuid}' does not provide socket ` +
               `read characteristic '${BTLE_SOCKET_UUIDS.read}'`);
      this._blackList.add(peripheral.uuid);
      return false;
    }

    const writeCharacteristic = characteristics.find(
      (char) => char.uuid.toLowerCase() === BTLE_SOCKET_UUIDS.write);
    if (!writeCharacteristic ||
        writeCharacteristic.properties.indexOf(`write`) === -1) {
      log.info(`Peripheral '${peripheral.uuid}' does not provide socket ` +
               `write characteristic '${BTLE_SOCKET_UUIDS.write}'`);
      this._blackList.add(peripheral.uuid);
      return false;
    }

    await this._discoverDescriptors(peripheral, readCharacteristic);
    if (!this._enabled || closure.disconnected) {
      return false;
    }

    log.info(`Discovered socket on peripheral '${peripheral.uuid}'`);
    return true;
  }

  _onDisconnect(connectionInfo: ConnectionInfo): void {
    const peripheral = connectionInfo.peripheral;
    log.info(`Peripheral '${peripheral.uuid}' disconnected`);

    this._connectionMap.delete(peripheral.uuid);

    const index = this._connectionsInProgress.indexOf(connectionInfo);
    if (index === -1) {
      log.debug(`Connection already removed from the list`);
      return;
    }

    invariant(index > -1);

    // Remove from the in-progress list.
    if (this._connectionsInProgress.length > 1) {
      this._connectionsInProgress.splice(index, 1);
    } else {
      invariant(this._connectionsInProgress[0] === connectionInfo);
      this._connectionsInProgress = [];
    }
  }

  async start(): Promise<void> {
    log.debug('start()');

    if (this._enabled) {
      return;
    }
    this._enabled = true;

    log.info(`Starting scan for socket service '${this._serviceUuid}'`);
    await this._startScan();
  }

  async stop(): Promise<void> {
    log.debug('stop()');

    if (!this._enabled) {
      return;
    }
    this._enabled = false;

    log.info(`Stopping scan`);
    await this._stopScan();

    this._blackList.clear();
    this._connectionQueue = [];
    this._connectionMap.clear();
    this._connectionsInProgress = [];
  }

  addToSkipList(peripheral: Peripheral): void {
    log.info(`Adding peripheral '${peripheral.uuid}' to skipList`);

    if (!this._skipList.has(peripheral.uuid)) {
      this._skipList.add(peripheral.uuid);
    }
  }

  removeFromSkipList(peripheral: Peripheral): void {
    log.info(`Removing peripheral '${peripheral.uuid}' from skipList`);

    this._skipList.delete(peripheral.uuid);
  }

  clearSkipList(): void {
    log.info(`Clearing skipList`);

    this._skipList.clear();
  }

  async pause(): Promise<void> {
    log.debug(`pause()`);

    if (!this._scanning) {
      return;
    }

    log.info(`Pausing scan`);
    await this._stopScan();
  }

  async resume(): Promise<void> {
    log.debug(`resume()`);

    if (this._scanning) {
      return;
    }

    if (!this._enabled) {
      log.debug(`No longer enabled`);
      return;
    }

    log.info(`Resuming scan`);
    await this._startScan();
  }
}
