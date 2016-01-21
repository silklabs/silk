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

const SCAN_DURATION_OVERRIDE =
  getintprop(`persist.silk.bt.socket.scandur`, -1);
const SCAN_DURATION_MS =
  SCAN_DURATION_OVERRIDE > 0 ?
  SCAN_DURATION_OVERRIDE :
  getintprop(`ro.silk.bt.socket.scan_dur_sec`, 5) * 1000;

const SCAN_INTERVAL_MS =
  getintprop(`persist.silk.bt.socket.scanint`, 500);

const MAX_SIMULTANEOUS_CONNECTIONS_OVERRIDE =
  getintprop(`persist.silk.bt.socket.max`, -1);
const MAX_SIMULTANEOUS_CONNECTIONS =
  MAX_SIMULTANEOUS_CONNECTIONS_OVERRIDE > 1 ?
  MAX_SIMULTANEOUS_CONNECTIONS_OVERRIDE :
  getintprop(`ro.silk.bt.socket.max_simul`, 4);

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
      this._serviceUuid = options.serviceUuid;
    }
    if (options.localName) {
      this._localName = options.localName;
    }
  }

  async _waitForEventWithTimeout(
    emitter: EventEmitter,
    eventName: string,
    start: () => void,
    stop: () => void,
    errorString: string
  ): Promise<any> {
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
        this._connectionsInProgress.length <= MAX_SIMULTANEOUS_CONNECTIONS) {
      this._attemptMoreConnections();
    }
  };

  async _nobleStartScan(): Promise<void> {
    const noble = this._noble;
    return this._waitForEventWithTimeout(
      noble,
      `scanStart`,
      () => noble.startScanning([], true),
      () => noble.stopScanning(),
      `Timed out while starting scan`
    );
  }

  async _nobleStopScan(): Promise<void> {
    const noble = this._noble;
    return this._waitForEventWithTimeout(
      noble,
      `scanStop`,
      () => noble.stopScanning(),
      () => {},
      `Timed out while stopping scan`
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

    this._scanPromise = this._nobleStopScan();
    await this._scanPromise;

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

    log.debug(`Toggling scan off`);
    await this._nobleStopScan();

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

      log.debug(`Toggling scan on`);
      await this._nobleStartScan();

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
      `connect`,
      () => peripheral.connect(),
      () => peripheral.disconnect(),
      `Timed out connecting to peripheral '${peripheral.uuid}'`
    );
    if (error) {
      throw error;
    }
  }

  async _discoverServices(peripheral: Peripheral): Promise<Array<Service>> {
    log.debug(`_discoverServices('${peripheral.uuid}'`);

    return await this._waitForEventWithTimeout(
      peripheral,
      `servicesDiscover`,
      () => peripheral.discoverServices([ this._serviceUuid ]),
      () => peripheral.disconnect(),
      `Timed out discovering services for peripheral '${peripheral.uuid}'`
    );
  }

  async _discoverCharacteristics(
    peripheral: Peripheral,
    service: Service
  ): Promise<Array<Characteristic>> {
    log.debug(`_discoverCharacteristics('${peripheral.uuid}', ` +
              `'${service.uuid}')`);

    return await this._waitForEventWithTimeout(
      service,
      `characteristicsDiscover`,
      () => service.discoverCharacteristics([
        BTLE_SOCKET_UUIDS.read,
        BTLE_SOCKET_UUIDS.write,
      ]),
      () => peripheral.disconnect(),
      `Timed out discovering characteristics for peripheral ` +
      `'${peripheral.uuid}'`
    );
  }

  async _discoverDescriptors(
    peripheral: Peripheral,
    characteristic: Characteristic
  ): Promise<void> {
    log.debug(`_discoverDescriptors('${peripheral.uuid}', ` +
              `'${characteristic.uuid}')`);

    return await this._waitForEventWithTimeout(
      characteristic,
      `descriptorsDiscover`,
      () => characteristic.discoverDescriptors(),
      () => peripheral.disconnect(),
      `Timed out discovering descriptors for peripheral '${peripheral.uuid}'`
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

    if (this._connectionsInProgress.length > MAX_SIMULTANEOUS_CONNECTIONS) {
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
      log.warn(error.toString());
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

    if (!this._enabled) {
      log.debug(`No longer enabled`);
      invariant(!this._connectionQueue.length);
      invariant(!this._connectionMap.size);
      invariant(!this._connectionsInProgress.length);
      return;
    }

    if (this._connectionsInProgress.indexOf(connectionInfo) === -1) {
      log.debug(`Connection already removed from the list`);
      return;
    }

    // Remove from the in-progress list.
    if (this._connectionsInProgress.length > 1) {
      const index = this._connectionsInProgress.indexOf(connectionInfo);
      invariant(index > -1);
      this._connectionsInProgress.splice(index, 1);
    } else {
      invariant(this._connectionsInProgress[0] === connectionInfo);
      this._connectionsInProgress = [];
    }

    this._connectionMap.delete(peripheral.uuid);
  }

  async start(): Promise<void> {
    log.debug('start()');

    if (!this._enabled) {
      this._enabled = true;
      log.info(`Starting scan for socket service '${this._serviceUuid}'`);
      await this._startScan();
    }
  }

  async stop(): Promise<void> {
    log.debug('stop()');

    if (this._enabled) {
      this._enabled = false;

      log.info(`Stopping scan`);
      await this._stopScan();

      this._blackList.clear();
      this._connectionQueue = [];
      this._connectionMap.clear();
      this._connectionsInProgress = [];
    } else {
      invariant(!this._blackList.size);
      invariant(!this._connectionQueue.length);
      invariant(!this._connectionMap.size);
      invariant(!this._connectionsInProgress.length);
    }
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
