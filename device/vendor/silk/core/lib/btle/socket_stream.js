/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import {Duplex} from 'stream';

import * as Metrics from '../metrics/btle';
import createLog from 'silk-log/device';

import type {
  Characteristic,
  Peripheral,
} from 'noble';

import type {DuplexStreamOptions} from 'silk-streams';

type WriteChunk = {
  chunk: Buffer | string;
  encoding: string;
};
type WriteCallback = (error: ?Error) => void;

type WriteMetricsData = {
  startTimeMs: number;
  sizeBytes: number;
};

const log = createLog(`btle-socket-stream`);

// This is the amount of time we will wait after issuing a write request without
// acknowledgement before returning an error to the caller.
const TIMEOUT_MS = 30000;

// See app/iOS/BLE/BLESocketPeripheral.swift for explanation of this constant.
const WRITE_MAX_BYTES = 132;

export default class SocketStream extends Duplex {

  _peripheral: Peripheral;
  _characteristic: Characteristic;

  _disconnected: boolean = false;
  _subscribed: boolean = false;
  _subscribedChanging: boolean = false;

  _outgoing: ?Array<Buffer> = null;
  _writeTimeout: ?number = null;
  _writeCallback: ?WriteCallback = null;
  _writeMetricsData: ?WriteMetricsData = null;

  _error: ?Error = null;
  _ended: boolean = false;
  _finished: boolean = false;
  _closed: boolean = false;

  _disconnectHandler: ?(() => void) = null;

  // Tell Flow that the |write| method can be hooked.
  write: (
    chunk: string | Buffer,
    encodingOrCallback?: string | Function,
    callback?: WriteCallback,
  ) => boolean;

  constructor(
    peripheral: Peripheral,
    characteristic: Characteristic,
    options?: DuplexStreamOptions,
  ) {
    log.debug(`constructor`);

    invariant(peripheral);
    invariant(peripheral.state === `connected`);

    invariant(characteristic);
    invariant(characteristic.properties.indexOf(`notify`) !== -1);
    invariant(characteristic.properties.indexOf(`write`) !== -1);

    super(options);

    peripheral.addListener(`disconnect`, this._onPeripheralDisconnect);
    this._peripheral = peripheral;

    characteristic.addListener(`write`, this._onCharacteristicWrite);
    this._characteristic = characteristic;

    this.addListener(`end`, this._onEnd);
    this.addListener(`finish`, this._onFinish);

    this._subscribe(true);
  }

  _cleanup(): void {
    log.debug(`_cleanup`);

    this.removeListener(`end`, this._onEnd);
    this.removeListener(`finish`, this._onFinish);
    this._characteristic.removeListener(`write`, this._onCharacteristicWrite);
    this._peripheral.removeListener(`disconnect`, this._onPeripheralDisconnect);

    clearTimeout(this._writeTimeout);
    this._writeTimeout = null;

    this._outgoing = null;
  }

  _onEnd: (() => void) = () => {
    log.debug(`_onEnd`);

    invariant(!this._ended);
    this._ended = true;

    this._maybeScheduleClose();
  };

  _onFinish: (() => void) = () => {
    log.debug(`_onFinish`);

    invariant(!this._finished);
    this._finished = true;

    if (this._subscribed) {
      this._subscribe(false);
      return;
    }

    this._maybeScheduleClose();
  };

  _maybeScheduleClose(): void {
    log.debug(`_maybeScheduleClose`, {
      closed: this._closed,
      ended: this._ended,
      error: this._error,
      finished: this._finished,
      subscribed: this._subscribed,
      disconnected: this._disconnected,
    });

    if (this._closed || !this._ended || !this._finished || this._subscribed) {
      return;
    }

    log.debug(`Scheduling 'close' event`);
    this._closed = true;

    process.nextTick(() => {
      log.debug(`Emitting 'close' event`);
      this.emit(`close`);
    });
  }

  _subscribe(shouldSubscribe: boolean): void {
    log.debug(`_subscribe`, shouldSubscribe);

    if (this._subscribed === shouldSubscribe) {
      log.debug(`Already ${shouldSubscribe ? '' : 'un'}subscribed`);
      return;
    }

    if (this._subscribedChanging) {
      log.debug(`Already ${shouldSubscribe ? '' : 'un'}subscribing`);
      return;
    }

    const eventName = `notify`;

    let listener: ((isSubscribed: boolean) => void);
    let timeout;
    let disconnectHandler;

    const cleanup = () => {
      invariant(this._disconnectHandler === disconnectHandler);
      invariant(this._subscribedChanging);
      invariant(timeout);
      this._disconnectHandler = null;
      this._subscribedChanging = false;
      clearTimeout(timeout);
      this._characteristic.removeListener(eventName, listener);
    };

    listener = (isSubscribed) => {
      log.debug(`${shouldSubscribe ? 'S' : 'Uns'}ubscribed`);

      cleanup();

      if (this._disconnected || this._error) {
        return;
      }

      if (shouldSubscribe !== isSubscribed) {
        if (shouldSubscribe) {
          process.nextTick(() => {
            this.emit(`metrics`, new Metrics.StreamSubscribeFailure());
          });
          this._emitError(new Error(`Failed to subscribe for notifications`));
          return;
        }

        log.warn(`Failed to unsubscribe`);

        // Pretend that we succeeded.
        isSubscribed = false;
      }

      invariant(this._subscribed !== isSubscribed);
      this._subscribed = isSubscribed;

      if (!this._subscribed) {
        this._maybeScheduleClose();
        return;
      }

      if (this._outgoing) {
        this._sendOutgoing();
      }
    };

    timeout = setTimeout(() => {
      cleanup();
      this._emitError(new Error(`Timed out while ` +
                                `${shouldSubscribe ? '' : 'un'}subscribing for ` +
                                `notifications`));
    }, TIMEOUT_MS);

    disconnectHandler = () => {
      cleanup();
      this._emitError(new Error(`Disconnected while ` +
                                `${shouldSubscribe ? '' : 'un'}subscribing for ` +
                                `notifications`));
    };

    this._characteristic.addListener(eventName, listener);
    this._disconnectHandler = disconnectHandler;

    this._subscribedChanging = true;
    this._characteristic.notify(shouldSubscribe);
  }

  // Stream API.
  _read(size?: number): void {
    log.debug(`_read`, size);

    // Nothing to do here, we push data as it arrives in |_onIncoming|.
  }

  // Stream API.
  _write(
    data: Buffer | string,
    encoding: string,
    callback: WriteCallback,
  ): boolean {
    log.debug(`_write <Buffer ${data.length}>`);

    invariant(data instanceof Buffer);
    invariant(encoding === `buffer`);

    if (this._error) {
      log.debug(`Unable to write due to previous error`);
      callback(this._error);
      return false;
    }

    invariant(!this._outgoing);
    invariant(!this._writeCallback);

    this._outgoing = [data];
    this._writeCallback = callback;

    this._sendOutgoing();
    return false;
  }

  // Stream API.
  _writev(chunks: Array<WriteChunk>, callback: WriteCallback): void {
    log.debug(`_writev ${chunks.length}`);

    invariant(chunks.length);

    if (this._error) {
      log.debug(`Unable to write due to previous error`);
      callback(this._error);
      return;
    }

    invariant(!this._outgoing);
    invariant(!this._writeCallback);

    this._outgoing = chunks.map((chunk: WriteChunk) => {
      invariant(chunk.encoding === `buffer`);
      invariant(chunk.chunk instanceof Buffer);
      return chunk.chunk;
    });
    this._writeCallback = callback;

    this._sendOutgoing();
  }

  // Called by SocketService.
  _onIncoming(data: Buffer): void {
    log.debug(`_onIncoming <Buffer ${data.length}>`);

    if (this._error) {
      log.debug(`Unable to push due to previous error`);
      return;
    }

    this.push(data);
  }

  // Called by SocketService.
  _onUnsubscribe(): void {
    log.debug(`_onUnsubscribe`);

    if (this._error) {
      log.debug(`Unable to push due to previous error`);
      return;
    }

    this.push(null);
  }

  _emitError(error: Error): void {
    log.debug(`_emitError`, error);

    if (this._error) {
      log.warn(`Received more than one error`, error);
      return;
    }

    this._error = error;
    log.warn(error);

    this._cleanup();

    this._ended = true;
    this._finished = true;

    const writeCallback = this._writeCallback;
    this._writeCallback = null;

    if (writeCallback) {
      writeCallback(error);
    } else {
      this.emit(`error`, error);
    }

    this._maybeScheduleClose();
  }

  // Called by SocketService or by Noble when the peripheral disconnects.
  _onPeripheralDisconnect: (() => void) = () => {
    log.debug(`_onPeripheralDisconnect`);

    if (this._disconnected) {
      return;
    }

    this._disconnected = true;

    this._cleanup();

    if (this._disconnectHandler) {
      this._disconnectHandler();
      invariant(!this._disconnectHandler);
    }

    this._subscribed = false;
    this._subscribedChanging = false;

    if (!this._ended) {
      this._ended = true;
      this.push(null);
    }

    if (!this._finished) {
      this._finished = true;
      this._emitError(new Error(`Disconnected unexpectedly`));
    }

    this._maybeScheduleClose();
  };

  _sendOutgoing(): void {
    log.debug(`_sendOutgoing`);

    if (!this._subscribed) {
      log.debug(`Waiting to subscribe before sending data`);
      return;
    }

    const outgoing = this._outgoing;
    if (!outgoing) {
      return;
    }

    const chunksToSend = [];
    let chunksToSendLength = 0;

    let outgoingIndex = 0;
    for (;
         outgoingIndex < outgoing.length &&
           chunksToSendLength < WRITE_MAX_BYTES;
         outgoingIndex++) {
      const chunk = outgoing[outgoingIndex];

      const availableLength = WRITE_MAX_BYTES - chunksToSendLength;
      invariant(availableLength > 0);

      if (chunk.length > availableLength) {
        // Slice the buffer and send as much as possible, leaving the rest for
        // later.
        chunksToSend.push(chunk.slice(0, availableLength));
        outgoing[outgoingIndex] = chunk.slice(availableLength);
        chunksToSendLength += availableLength;
        break;
      }

      chunksToSend.push(chunk);
      chunksToSendLength += chunk.length;
    }

    invariant(chunksToSend.length);
    invariant(chunksToSendLength <= WRITE_MAX_BYTES);

    if (outgoingIndex) {
      if (outgoingIndex === outgoing.length) {
        this._outgoing = null;
      } else {
        outgoing.splice(0, outgoingIndex);
      }
    }

    const data = chunksToSend.length === 1 ?
                 chunksToSend[0] :
                 Buffer.concat(chunksToSend);
    invariant(data.length === chunksToSendLength);

    invariant(!this._writeMetricsData);
    this._writeMetricsData = {
      startTimeMs: Date.now(),
      sizeBytes: data.length,
    };

    this._characteristic.write(data, /* withoutResponse */ false);

    this._writeTimeout = setTimeout(() => {
      this._onCharacteristicWrite(new Error(`Timed out while writing`));
    }, TIMEOUT_MS);
  }

  _onCharacteristicWrite: ((error?: Error) => void) = (error) => {
    log.debug(`_onCharacteristicWrite`, error || ``);

    const now = Date.now();

    invariant(this._writeTimeout);
    clearTimeout(this._writeTimeout);
    this._writeTimeout = null;

    const metricsData = this._writeMetricsData;
    this._writeMetricsData = null;
    invariant(metricsData);

    if (error) {
      this._emitError(error);
      return;
    }

    if (this._error || !this._subscribed) {
      return;
    }

    const durationMs = now - metricsData.startTimeMs;
    process.nextTick(() => {
      this.emit(
        `metrics`,
        new Metrics.StreamWrite(Math.max(durationMs, 0), metricsData.sizeBytes),
      );
    });

    if (this._outgoing) {
      log.debug(`More data to be sent`);
      this._sendOutgoing();
      return;
    }

    const writeCallback = this._writeCallback;
    this._writeCallback = null;
    invariant(writeCallback);

    log.debug(`All data sent`);
    writeCallback();
  };
}
