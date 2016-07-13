/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import {
  Characteristic as BlenoCharacteristic,
  PrimaryService as BlenoService,
} from 'bleno';
import {BTLE_SOCKET_UUIDS} from 'silk-api';

import SocketStream from './socket_stream';
import createLog from '../log';

import type {
  Bleno,
  NotifyAttributeCallback,
  WriteAttributeCallback,
} from 'bleno';
import type {
  Characteristic,
  Noble,
  Peripheral,
  Service,
} from 'noble';

const log = createLog(`btle-socket-service`);

const DEFAULT_CONNECTION_TIMEOUT_MS = 10000;

class SocketCharacteristic extends BlenoCharacteristic {

  _service: ?SocketService = null;

  constructor() {
    super({
      uuid: BTLE_SOCKET_UUIDS.characteristic,
      properties: [`write`, `notify`],
    });
  }

  onWriteRequest(
    data: Buffer,
    offset: number,
    withoutResponse: boolean,
    callback: WriteAttributeCallback,
    address: string,
  ): void {
    log.debug(`SocketCharacteristic.onWriteRequest`,
              `<Buffer ${data.length}>`,
              offset,
              withoutResponse,
              address);

    if (offset) {
      log.warn(`Received write with offset`, offset);
    }

    invariant(this._service);
    this._service._onWrite(address, data, callback);
  }

  onSubscribe(
    maxValueSize: number,
    updateValueCallback: NotifyAttributeCallback,
    address: string,
  ): void {
    log.debug(`onSubscribe`, maxValueSize, address);

    invariant(this._service);
    this._service._onSubscribe(address);
  }

  onUnsubscribe(address: string): void {
    log.debug(`onUnsubscribe`, address);

    invariant(this._service);
    this._service._onUnsubscribe(address);
  }

}

export default class SocketService extends BlenoService {

  _noble: Noble;
  _bleno: Bleno;
  _peripherals: Map<string, Peripheral> = new Map();
  _streams: Map<string, SocketStream> = new Map();
  _queuedStreamData: Map<string, Array<Buffer>> = new Map();
  _stopHandler: ?(() => void) = null;
  _scanning: boolean = false;
  _enabled: boolean = true;

  constructor(
    noble: Noble,
    bleno: Bleno,
    uuid?: string = BTLE_SOCKET_UUIDS.service,
  ) {
    const characteristic = new SocketCharacteristic();

    super({
      uuid,
      characteristics: [
        characteristic,
      ],
    });

    characteristic._service = this;

    noble.addListener(`discover`, this._onDiscover);
    noble.addListener(`scanStart`, this._onScanStart);
    noble.addListener(`scanStop`, this._onScanStop);
    bleno.addListener(`disconnect`, this._onDisconnect);

    this._noble = noble;
    this._bleno = bleno;
  }

  async stop(): Promise<void> {
    log.debug(`SocketService.stop`);

    this._enabled = false;
    this._peripherals.clear();
    this._queuedStreamData.clear();

    this._noble.removeListener(`discover`, this._onDiscover);
    this._noble.removeListener(`scanStart`, this._onScanStart);
    this._noble.removeListener(`scanStop`, this._onScanStop);

    if (this._stopHandler) {
      this._stopHandler();
      invariant(!this._stopHandler);
    }

    let promises = [];
    this._streams.forEach((stream, address) => {
      log.debug(`Peripheral ${address} still connected`);
      promises.push(new Promise((resolve) => {
        const listener = (disconnectedAddress) => {
          if (disconnectedAddress === address) {
            this._bleno.removeListener(`disconnect`, listener);
            resolve();
          }
        };
        this._bleno.addListener(`disconnect`, listener);
        this._bleno.disconnect(address);
      }));
    });

    if (promises.length) {
      try {
        log.debug(`Waiting for ${promises.length} peripherals to disconnect`);
        await Promise.all(promises);
      } catch (error) {
        log.warn(error);
      }
      log.debug(`Done waiting`);
    }

    this._bleno.removeListener(`disconnect`, this._onDisconnect);
    this._streams.clear();
  }

  _onDiscover: ((peripheral: Peripheral) => void) = (peripheral) => {
    log.debug(`SocketService._onDiscover`, peripheral.address);

    if (!this._enabled) {
      return;
    }

    if (!this._scanning ||
        peripheral.advertisement.serviceUuids.indexOf(this.uuid) !== -1) {
      this._peripherals.set(peripheral.address, peripheral);
    }
  };

  _onScanStart: (() => void) = () => {
    log.debug(`SocketService._onScanStart`);

    if (!this._enabled) {
      return;
    }

    this._scanning = true;
  };

  _onScanStop: (() => void) = () => {
    log.debug(`SocketService._onScanStop`);

    if (!this._enabled) {
      return;
    }

    this._scanning = false;
  };

  _onDisconnect: ((address: string) => void) = (address) => {
    log.debug(`SocketService._onDisconnect`, address);

    const stream = this._streams.get(address);
    if (!stream) {
      return;
    }

    this._streams.delete(address);

    stream._onPeripheralDisconnect();
  };

  _onSubscribe(address: string): void {
    log.debug(`SocketService._onSubscribe`, address);

    if (!this._enabled) {
      return;
    }

    const peripheral = this._peripherals.get(address);
    if (!peripheral) {
      log.warn(`No peripheral connected yet`);
      return;
    }

    invariant(!this._streams.has(address));
    invariant(!this._queuedStreamData.has(address));

    this._queuedStreamData.set(address, []);

    const disconnectOnFailure =
      peripheral.state !== `connected` && peripheral.state !== `connecting`;

    this._startConnection(peripheral).catch((error) => {
      log.warn(error);
    }).then(() => {
      this._queuedStreamData.delete(address);

      // If we connected to this peripheral but something failed or the
      // peripheral didn't provide the right services then disconnect it now.
      if (!this._streams.has(address) && disconnectOnFailure) {
        log.debug(`Disconnecting peripheral`);
        peripheral.disconnect();
      }
    });
  }

  _onUnsubscribe(address: string): void {
    log.debug(`SocketService._onUnsubscribe`, address);

    this._queuedStreamData.delete(address);

    const stream = this._streams.get(address);
    if (!stream) {
      log.debug(`No stream for peripheral '${address}'`);
      return;
    }

    // If we're being called within a disconnect event then we don't want to
    // think that the other side told us it was finished. Delay the unsubscribe
    // call to let that disconnect event set an error on the stream.
    process.nextTick(() => {
      const stream = this._streams.get(address);
      if (stream) {
        this._streams.delete(address);
        stream._onUnsubscribe();
      }
    });
  }

  _onWrite(
    address: string,
    data: Buffer,
    callback: WriteAttributeCallback,
  ): void {
    log.debug(`SocketService._onWrite`, address, `<Buffer ${data.length}>`);

    const stream = this._streams.get(address);
    if (stream) {
      stream._onIncoming(data);
      callback(BlenoCharacteristic.RESULT_SUCCESS);
      return;
    }

    if (!this._peripherals.has(address)) {
      log.warn(`No stream for peripheral '${address}'`);
      callback(BlenoCharacteristic.RESULT_UNLIKELY_ERROR);
      return;
    }

    const queue = this._queuedStreamData.get(address);
    if (!queue) {
      log.warn(`No subscription for peripheral '${address}'`);
      callback(BlenoCharacteristic.RESULT_UNLIKELY_ERROR);
      return;
    }

    log.debug(`Queuing write for peripheral '${address}'`);
    queue.push(data);
    callback(BlenoCharacteristic.RESULT_SUCCESS);
  }

  _waitForEventWithTimeout(
    peripheral: Peripheral,
    emitter: Characteristic | Peripheral | Service,
    eventName: string,
    start: () => void,
    errorString: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let disconnectListener;
      let eventListener;
      let timeout;

      const disconnectName = `disconnect`;

      const cleanup = () => {
        invariant(this._stopHandler === cleanup);
        invariant(timeout);
        this._stopHandler = null;
        clearTimeout(timeout);
        peripheral.removeListener(disconnectName, disconnectListener);
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
        reject(new Error(`Timed out while ${errorString}`));
      }, DEFAULT_CONNECTION_TIMEOUT_MS);

      peripheral.addListener(disconnectName, disconnectListener);
      emitter.addListener(eventName, eventListener);

      invariant(!this._stopHandler);
      this._stopHandler = cleanup;

      start();
    });
  }

  _connect(peripheral: Peripheral): Promise<void> {
    log.debug(`SocketService._connect`, peripheral.address);

    return this._waitForEventWithTimeout(
      peripheral,
      peripheral,
      `connect`,
      () => peripheral.connect(),
      `connecting to peripheral '${peripheral.address}'`
    );
  }

  _discoverServices(peripheral: Peripheral): Promise<Array<Service>> {
    log.debug(`SocketService._discoverServices`, peripheral.address);

    return this._waitForEventWithTimeout(
      peripheral,
      peripheral,
      `servicesDiscover`,
      () => peripheral.discoverServices([this.uuid]),
      `discovering services for peripheral '${peripheral.address}'`
    );
  }

  _discoverCharacteristics(
    peripheral: Peripheral,
    service: Service
  ): Promise<Array<Characteristic>> {
    log.debug(`SocketService._discoverCharacteristics`,
              peripheral.address,
              service.uuid);

    return this._waitForEventWithTimeout(
      peripheral,
      service,
      `characteristicsDiscover`,
      () => service.discoverCharacteristics(),
      `discovering characteristics for peripheral '${peripheral.address}'`
    );
  }

  _discoverDescriptors(
    peripheral: Peripheral,
    service: Service,
    characteristic: Characteristic
  ): Promise<void> {
    log.debug(`SocketService._discoverDescriptors`,
              peripheral.address,
              service.uuid,
              characteristic.uuid);

    return this._waitForEventWithTimeout(
      peripheral,
      characteristic,
      `descriptorsDiscover`,
      () => characteristic.discoverDescriptors(),
      `discovering descriptors for peripheral '${peripheral.address}'`
    );
  }

  async _startConnection(peripheral: Peripheral): Promise<void> {
    const {address} = peripheral;
    log.debug(`SocketService._startConnection`, address);

    if (peripheral.state === `disconnected` || peripheral.state === `error`) {
      await this._connect(peripheral);
    }

    log.debug(`Connected to peripheral`);

    const services = await this._discoverServices(peripheral);
    if (!this._enabled) {
      return;
    }

    log.debug(`Discovered services`);

    const service =
      services.find((service) => service.uuid.toLowerCase() === this.uuid);
    if (!service) {
      log.warn(`Peripheral '${address}' does not provide socket service ` +
               `'${this.uuid}'`);
      return;
    }

    const characteristics =
      await this._discoverCharacteristics(peripheral, service);
    if (!this._enabled) {
      return;
    }

    log.debug(`Discovered characteristics`);

    const characteristic = characteristics.find(
      (char) => char.uuid.toLowerCase() === BTLE_SOCKET_UUIDS.characteristic);
    if (!characteristic ||
        characteristic.properties.indexOf(`notify`) === -1 ||
        characteristic.properties.indexOf(`write`) === -1) {
      log.warn(`Peripheral '${address}' does not provide socket ` +
               `characteristic '${BTLE_SOCKET_UUIDS.characteristic}'`);
      return;
    }

    await this._discoverDescriptors(peripheral, service, characteristic);
    if (!this._enabled) {
      return;
    }

    log.debug(`Discovered descriptors`);

    const stream = new SocketStream(peripheral, characteristic);
    stream.once(`close`, () => {
      this._bleno.disconnect(address);
    });

    this._streams.set(address, stream);

    log.info(`New stream for peripheral '${address}' created`);
    try {
      this.emit(`connect`, stream, peripheral);
    } catch (error) {
      this._streams.delete(address);
      throw error;
    }

    const queuedData = this._queuedStreamData.get(address);
    if (queuedData) {
      log.debug(`Delivering queued data for peripheral '${address}'`);
      this._queuedStreamData.delete(address);
      queuedData.forEach((data) => {
        stream._onIncoming(data);
      });
    }
  }

}
