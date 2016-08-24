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
import createLog from 'silk-log/device';

import type {
  Bleno,
  NotifyAttributeCallback,
  WriteAttributeCallback,
} from 'bleno';
import type {
  AdapterState,
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

  static _noble: ?Noble = null;
  static _bleno: ?Bleno = null;
  static _peripherals: Map<string, Peripheral> = new Map();

  _streams: Map<string, SocketStream> = new Map();
  _queuedStreamData: Map<string, Array<Buffer>> = new Map();
  _stopHandlers: Set<(() => void)> = new Set();
  _enabled: boolean = true;

  constructor(
    noble: Noble,
    bleno: Bleno,
    uuid?: string = BTLE_SOCKET_UUIDS.service,
  ) {
    if (SocketService._noble) {
      invariant(SocketService._bleno);
    } else {
      invariant(!SocketService._bleno);

      noble.addListener(`stateChange`, (state: AdapterState) => {
        log.debug(`SocketService._onStateChange`, state);
        if (state !== 'poweredOn') {
          SocketService._peripherals.clear();
        }
      });

      noble.addListener(`discover`, (peripheral: Peripheral) => {
        log.debug(`SocketService._onDiscover`, peripheral.address);

        SocketService._peripherals.set(peripheral.address, peripheral);
      });

      SocketService._noble = noble;
      SocketService._bleno = bleno;
    }

    const characteristic = new SocketCharacteristic();

    super({
      uuid,
      characteristics: [
        characteristic,
      ],
    });

    characteristic._service = this;

    bleno.addListener(`disconnect`, this._onDisconnect);
  }

  async stop(): Promise<void> {
    log.debug(`SocketService.stop`);

    this._enabled = false;
    this._queuedStreamData.clear();

    if (this._stopHandlers.size) {
      const handlers = Array.from(this._stopHandlers);
      handlers.forEach((handler) => handler());
      this._stopHandlers.clear();
    }

    const bleno = SocketService._bleno;
    invariant(bleno);

    let promises = [];
    this._streams.forEach((stream, address) => {
      log.debug(`Peripheral ${address} still connected`);

      promises.push(new Promise((resolve) => {
        const listener = (disconnectedAddress) => {
          if (disconnectedAddress === address) {
            bleno.removeListener(`disconnect`, listener);
            resolve();
          }
        };
        bleno.addListener(`disconnect`, listener);
        bleno.disconnect(address);
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

    bleno.removeListener(`disconnect`, this._onDisconnect);
    this._streams.clear();
  }

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

    const peripheral = SocketService._peripherals.get(address);
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

    if (!SocketService._peripherals.has(address)) {
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
        invariant(this._stopHandlers.has(cleanup));
        invariant(timeout);
        this._stopHandlers.delete(cleanup);
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

      invariant(!this._stopHandlers.has(cleanup));
      this._stopHandlers.add(cleanup);

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

    invariant(peripheral.state === `connected`);

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

    invariant(peripheral.state === `connected`);

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

    invariant(peripheral.state === `connected`);

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
      const error = await this._connect(peripheral);
      if (error) {
        log.warn(`Failed to connect to peripheral`, address, error);
        return;
      }
    }

    log.debug(`Connected to peripheral`, address);

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

    if (!this.listenerCount(`connect`)) {
      throw new Error(`Nobody is listening for the 'connect' event`);
    }

    const stream = new SocketStream(peripheral, characteristic);
    stream.once(`close`, () => {
      log.debug(`Stream closed`, address);
    });

    const queuedData = this._queuedStreamData.get(address);
    invariant(queuedData);

    this._queuedStreamData.delete(address);

    if (queuedData.length) {
      log.debug(`Delivering queued data for peripheral '${address}'`);
      queuedData.forEach((data) => {
        stream._onIncoming(data);
      });
    }

    this._streams.set(address, stream);

    log.info(`New stream for peripheral '${address}' created`);
    try {
      this.emit(`connect`, stream, peripheral);
    } catch (error) {
      this._streams.delete(address);
      throw error;
    }
  }

}
