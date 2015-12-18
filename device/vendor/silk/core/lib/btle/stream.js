/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import { BTLE_SOCKET_UUIDS } from 'silk-api';
import { Duplex } from 'stream';
import makeLog from '../log';

import type { Peripheral, Characteristic } from 'noble';

// It'd be nice if we could import these from Flow's interface definitions
// rather than having to copy them here.
type ReadableStreamOptions = {
  highWaterMark?: number,
  encoding?: ?string,
  objectMode?: boolean
};
type WritableStreamOptions = {
  highWaterMark?: number,
  decodeString?: boolean,
  objectMode?: boolean
};
type DuplexStreamOptions = WritableStreamOptions & ReadableStreamOptions & {
  allowHalfOpen?: boolean,
  readableObjectMode?: boolean,
  writableObjectMode?: boolean
};

const log = makeLog(`btle-stream`);

// This is the amount of time we will wait after issuing a read or write request
// without acknowledgement before returning an error to the caller. It's pretty
// arbitrary.
const TIMEOUT_MS = 15000;

// See app/iOS/BLE/BLESocketPeripheral.swift for explanation of this constant.
const WRITE_MAX_BYTES = 132;

export default class Stream extends Duplex {

  _peripheral: Peripheral;
  _serviceUuid: string;
  _readCharacteristic: Characteristic;
  _writeCharacteristic: Characteristic;

  _disconnected: boolean = false;
  _subscribed: boolean = false;

  _readTimeout: ?number = null;
  _readAckTimeout: ?number = null;

  _outgoing: Array<Buffer> = [];
  _writeTimeout: ?number = null;

  _error: ?Error = null;

  _emittedError: boolean = false;
  _ended: boolean = false;
  _finishing: boolean = false;
  _finished: boolean = false;
  _closed: boolean = false;

  constructor(
    peripheral: Peripheral,
    serviceUuid: string,
    options?: DuplexStreamOptions
  ) {
    log.debug(`Stream('${serviceUuid}')`);

    invariant(peripheral);
    invariant(peripheral.state === `connected`);
    invariant(serviceUuid);

    super(options);

    peripheral.addListener(`disconnect`, this._onDisconnect);
    this._peripheral = peripheral;

    this._serviceUuid = serviceUuid;

    const socketService = peripheral.services.find(
      (service) => service.uuid.toLowerCase() === this._serviceUuid);
    invariant(socketService);

    const readCharacteristic = socketService.characteristics.find(
      (char) => char.uuid.toLowerCase() === BTLE_SOCKET_UUIDS.read);
    invariant(readCharacteristic);
    invariant(readCharacteristic.properties.indexOf(`notify`) !== -1);
    invariant(readCharacteristic.properties.indexOf(`read`) !== -1);
    invariant(readCharacteristic.properties.indexOf(`write`) !== -1);

    readCharacteristic.addListener(`data`, this._onData);
    readCharacteristic.addListener(`write`, this._onDataAcknowledged);
    this._readCharacteristic = readCharacteristic;

    const writeCharacteristic = socketService.characteristics.find(
      (char) => char.uuid.toLowerCase() === BTLE_SOCKET_UUIDS.write);
    invariant(writeCharacteristic);
    invariant(writeCharacteristic.properties.indexOf(`write`) !== -1);

    writeCharacteristic.addListener(`write`, this._onWrite);
    this._writeCharacteristic = writeCharacteristic;

    this._enableNotifications();
  }

  emit(eventName: string, ...args: Array<any>): boolean {
    switch (eventName) {
    case `end`:
      invariant(!this._ended);
      this._ended = true;
      this._maybeScheduleClose();

      if (this._error) {
        log.debug(`Blocked the '${eventName}' event due to previous error`);
        return false;
      }

      log.debug(`Emitting '${eventName}' event`);
      break;

    case `finish`:
      invariant(!this._finished);

      this._finishing = true;

      if (this._outgoing.length) {
        log.debug(`Waiting for all data to be written before emitting ` +
                  `'${eventName}' event`);
        invariant(this._subscribed);
        return false;
      }

      if (this._subscribed) {
        log.debug(`Disabling notifications before emitting '${eventName}' ` +
                  `event`);
        this._disableNotifications();
        return false;
      }

      this._finished = true;
      this._maybeScheduleClose();

      if (this._error) {
        log.debug(`Blocked the '${eventName}' event due to previous error`);
        return false;
      }

      log.debug(`Emitting '${eventName}' event`);
      break;

    default:
      break;
    }

    return super.emit(eventName, ...args);
  }

  _read(/* size */) {
    log.debug(`Stream._read()`);

    // Nothing to do here. Data will be pushed as it arrives from the connected
    // device in |_onData()|.
  }

  // Part of the stream API.
  _write(
    data: Buffer,
    encoding: 'buffer',
    callback: Function
  ): void {
    log.debug(`Stream._write(<Buffer ${data.length}>)`);

    invariant(data.length);
    invariant(encoding === `buffer`);

    if (this._error) {
      log.debug(`Unable to write due to previous error`);
      callback(this._error);
      return;
    }

    this._outgoing.push(data);

    if (this._outgoing.length === 1 &&
        this._subscribed &&
        !this._writeTimeout) {
      // Allow more data to be written on this turn of the event loop.
      process.nextTick(() => this._sendOutgoing());
    }

    callback(null);
  }

  _maybeScheduleClose() {
    log.debug(`Stream._maybeScheduleClose()`);

    if (this._ended && this._finished && !this._closed) {
      log.debug(`Scheduling 'close' event`);
      this._closed = true;
      process.nextTick(() => {
        log.debug(`Emitting 'close' event`);
        this.emit(`close`);
      });
    }
  }

  _enableNotifications() {
    log.debug(`Stream._enableNotifications()`);

    const eventName = `notify`;

    let timeout;

    const listener = (state) => {
      log.debug(`Notifications %sabled`, state ? `en` : `dis`);

      this._readCharacteristic.removeListener(eventName, listener);
      clearTimeout(timeout);

      if (this._disconnected) {
        return;
      }

      if (!state) {
        this._emitError(new Error(`Failed to enable notifications`));
        return;
      }

      invariant(!this._subscribed);
      this._subscribed = true;

      // Start reading.
      this._requestData();

      // Start writing.
      if (this._outgoing.length) {
        this._sendOutgoing();
      }
    };

    timeout = setTimeout(() => {
      this._readCharacteristic.removeListener(eventName, listener);
      this._emitError(new Error(`Timed out while enabling notifications`));
    }, TIMEOUT_MS);

    this._readCharacteristic.addListener(eventName, listener);
    this._readCharacteristic.notify(true);
  }

  _disableNotifications() {
    log.debug(`Stream._disableNotifications()`);

    invariant(!this._disconnected);

    if (!this._subscribed) {
      return;
    }

    this._subscribed = false;

    this._readCharacteristic.removeListener(`data`, this._onData);
    clearTimeout(this._readTimeout);
    this._readTimeout = null;

    this._readCharacteristic.removeListener(`write`, this._onDataAcknowledged);
    clearTimeout(this._readAckTimeout);
    this._readAckTimeout = null;

    const eventName = `notify`;

    let finish;
    let timeout;

    const listener = (state) => {
      log.debug(`Notifications %sabled`, state ? `en` : `dis`);
      clearTimeout(timeout);
      finish();
    };

    finish = () => {
      this._readCharacteristic.removeListener(eventName, listener);

      this.emit(`finish`);
      this.push(null);
    };

    timeout = setTimeout(() => {
      log.warn(`Timed out while disabling notifications`);
      finish();
    }, TIMEOUT_MS);

    this._readCharacteristic.addListener(eventName, listener);
    this._readCharacteristic.notify(false);
  }

  _requestData() {
    log.debug(`Stream._requestData()`);

    invariant(!this._readTimeout);
    invariant(!this._readAckTimeout);

    if (!this._subscribed) {
      return;
    }

    this._readCharacteristic.read();
    this._readTimeout = setTimeout(() => {
      this._emitError(new Error(`Timed out while reading`));
    }, TIMEOUT_MS);
  }

  _sendOutgoing() {
    log.debug(`Stream._sendOutgoing()`);

    if (!this._subscribed || this._error) {
      return;
    }

    invariant(this._outgoing.length);
    invariant(!this._writeTimeout);

    let chunksToSend = [ ];
    let chunksToSendLength = 0;

    let outgoingIndex = 0;
    for ( ; outgoingIndex < this._outgoing.length; outgoingIndex++) {
      let chunk = this._outgoing[outgoingIndex];

      invariant(Buffer.isBuffer(chunk));
      invariant(chunk.length);

      let availableLength = WRITE_MAX_BYTES - chunksToSendLength;

      if (chunk.length > availableLength) {
        // Slice the buffer and send as much as possible, leaving the rest for
        // later.
        chunksToSend.push(chunk.slice(0, availableLength));
        this._outgoing[outgoingIndex] = chunk.slice(availableLength);
        chunksToSendLength += availableLength;
        break;
      }

      chunksToSend.push(chunk);
      chunksToSendLength += chunk.length;

      if (chunksToSendLength === WRITE_MAX_BYTES) {
        break;
      }
    }

    invariant(chunksToSend.length);
    invariant(chunksToSendLength <= WRITE_MAX_BYTES);

    if (outgoingIndex) {
      this._outgoing.splice(0, outgoingIndex);
    }

    const data = chunksToSend.length === 1 ?
                 chunksToSend[0] :
                 Buffer.concat(chunksToSend);
    invariant(data.length === chunksToSendLength);

    this._writeCharacteristic.write(data, /* withoutResponse */ false);

    this._writeTimeout = setTimeout(() => {
      this._onWrite(new Error(`Timed out while writing`));
    }, TIMEOUT_MS);
  }

  _emitError(error: Error) {
    log.debug(`Stream._emitError('${error.toString()}')`);

    if (this._error) {
      log.warn(`Received more than one error`, error);
      return;
    }

    log.warn(error);

    // Make all future writes fail with this error.
    this._error = error;

    // End the read stream.
    this.push(null);

    // Don't hang on to data that we will never send.
    this._outgoing = [];

    // End the write stream.
    this.end();

    this.emit(`error`, error);
  }

  _onDisconnect: (() => void) = () => {
    log.debug(`Stream._onDisconnect()`);

    this._peripheral.removeListener(`disconnect`, this._onDisconnect);
    this._readCharacteristic.removeListener(`data`, this._onData);
    this._writeCharacteristic.removeListener(`write`, this._onWrite);

    invariant(!this._disconnected);
    this._disconnected = true;

    this._subscribed = false;

    clearTimeout(this._readTimeout);
    this._readTimeout = null;

    clearTimeout(this._readAckTimeout);
    this._readAckTimeout = null;

    clearTimeout(this._writeTimeout);
    this._writeTimeout = null;

    if (this._finished) {
      invariant(this._ended);
    } else {
      this._emitError(new Error(`Disconnected unexpectedly`));
    }
  };

  _onData: ((data: Buffer, isNotification: boolean) => void) = (data, isNotification) => {
    log.debug(`Stream._onData(<Buffer ${data.length}>, ${isNotification})`);

    invariant(Buffer.isBuffer(data));

    if (isNotification) {
      invariant(!data.length);

      if (!this._readTimeout && !this._readAckTimeout) {
        this._requestData();
      }
      return;
    }

    invariant(this._readTimeout);
    invariant(!this._readAckTimeout);

    clearTimeout(this._readTimeout);
    this._readTimeout = null;

    if (!data.length) {
      return;
    }

    if (this._subscribed) {
      // Acknowledge receipt of the data.
      this._readCharacteristic.write(new Buffer(0),
                                     /* withoutResponse */ false);

      this._readAckTimeout = setTimeout(() => {
        this._onDataAcknowledged(new Error(`Timed out while acknowledging`));
      }, TIMEOUT_MS);
    }

    // Make the data available to stream consumers.
    this.push(data);
  };

  _onDataAcknowledged: ((error?: Error) => void) = (error) => {
    log.debug(`Stream._onDataAcknowledged(%s)`, error ? `'${error.toString()}'` : ``);

    invariant(this._readAckTimeout);
    clearTimeout(this._readAckTimeout);
    this._readAckTimeout = null;

    if (error) {
      this._emitError(error);
      return;
    }

    if (this._subscribed) {
      // Ask for more data immediately.
      this._requestData();
    }
  };

  _onWrite: ((error?: Error) => void) = (error) => {
    log.debug(`Stream._onWrite(%s)`, error ? `'${error.toString()}'` : ``);

    invariant(this._writeTimeout);
    clearTimeout(this._writeTimeout);
    this._writeTimeout = null;

    if (error) {
      this._emitError(error);
      return;
    }

    if (this._error || !this._subscribed) {
      return;
    }

    if (this._outgoing.length) {
      this._sendOutgoing();
      return;
    }

    if (this._finishing) {
      log.debug(`All data written`);
      this._writeCharacteristic.removeListener(`write`, this._onWrite);
      this._disableNotifications();
    }
  };
}
