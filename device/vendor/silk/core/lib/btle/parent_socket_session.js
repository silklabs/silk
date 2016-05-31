/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import {
  DuplexTransform,
  MessagePackDuplexStream,
  SocketDuplexStream,
} from 'silk-streams';

import api from '../api';
import createLog from '../log';
import {createMessage as createInternalMessage} from './socket_message_utils';
import InternalMessageFilterStream from './internal_message_stream';
import * as Metrics from '../metrics/btle';

import type {Socket} from 'net';

const log = createLog(`btle-parent-socketsession`);

export default class ParentSocketSession extends DuplexTransform {

  // Set to true when |end()| is called.
  _ending: boolean = false;

  // Set to true once the 'end' or 'error' event is emitted.
  _ended: boolean = false;

  _rssiValue: number = 0;
  _rssiUpdatesEnabled: boolean = false;
  _rssiUpdatesKilled: boolean = false;

  _authenticated: boolean = false;
  _allowUnauthenticated: boolean = false;
  _emittedUnauthenticated: boolean = false;

  // Stuff that gets tracked for metrics.
  _startTime: number = Date.now();
  _receivedBytes: number = 0;
  _sentBytes: number = 0;
  _flatlined: boolean = false;
  _errorMessage: string = ``;

  _internalStream: InternalMessageFilterStream;

  constructor(socket: Socket) {
    log.debug(`constructor`);

    const socketStream = new SocketDuplexStream(socket);
    const msgpackStream = new MessagePackDuplexStream(socketStream);
    const internalStream = new InternalMessageFilterStream(msgpackStream);

    msgpackStream.on(`data`, (data) => {
      log.verbose(`Received`, data);
    });
    const msgpackOldWrite = msgpackStream.write;
    // $FlowFixMe: Flow doesn't like it when we replace functions.
    msgpackStream.write = (data, ...args) => {
      log.verbose(`Sending`, data);
      return msgpackOldWrite.call(msgpackStream, data, ...args);
    };

    super(internalStream, internalStream, null, null, {
      objectMode: true,
    });

    this.once(`end`, this._onEnd);
    this.once(`error`, this._onError);
    this.once(`close`, this._onClose);
    internalStream.addListener(`internalMessage`, this._onInternalMessage);

    socketStream.on(`data`, (data) => {
      this._receivedBytes += data.length;
    });
    const socketOldWrite = socketStream.write;
    // $FlowFixMe: Flow doesn't like it when we replace functions.
    socketStream.write = (data, ...args) => {
      if (data) {
        this._sentBytes += data.length;
      }
      return socketOldWrite.call(socketStream, data, ...args);
    };

    this._internalStream = internalStream;
  }

  _onRssiUpdate(rssi: number): void {
    log.debug(`_onRssiUpdate`, rssi);

    if (this._rssiUpdatesKilled) {
      return;
    }

    if (this._rssiValue !== rssi) {
      this._rssiValue = rssi;
      this.emit(`rssiUpdate`, rssi);
    }
  }

  _onFlatline(): void {
    log.debug(`_onFlatline`);

    this._flatlined = true;

    const error = new Error(`Failed to receive heartbeat message in expected ` +
                            `time`);
    log.warn(error);
    this.emit(`error`, error);
  }

  _onAuthenticated(authenticated: boolean): void {
    log.debug(`_onAuthenticated`, authenticated);

    invariant(!this._emittedUnauthenticated);

    if (authenticated) {
      log.info(`Authenticated`);
      this._authenticated = true;
      this.emit(`authenticated`);
      return;
    }

    invariant(!this._authenticated);

    if (this._allowUnauthenticated) {
      log.debug(`Already informed child that unauthenticated data is allowed`);
      return;
    }

    this._emittedUnauthenticated = true;

    this.emit(`unauthenticated`);
    if (!this._allowUnauthenticated) {
      log.warn(`Unauthenticated data was not explicitly allowed`);
      this._internalStream.writeInternal(createInternalMessage({
        name: `allowUnauthenticated`,
        allow: false,
      }));
    }
  }

  _onEnd: (() => void) = () => {
    log.debug(`_onEnd`);

    this._ended = true;

    this._killRssiUpdates();
  };

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`_onError`, error);

    if (this._errorMessage) {
      log.warn(`Multiple error events`, error);
      return;
    }

    this._errorMessage = error.message;
    this._ended = true;
    this._killRssiUpdates();
  };

  _onClose: (() => void) = () => {
    log.debug(`_onClose`);

    let duration = Date.now() - this._startTime;
    if (duration < 0) {
      log.warn(`Time changed, unknown session duration`);
      duration = 0;
    }

    const commonArgs = [
      duration,
      this._receivedBytes,
      this._sentBytes,
      this.authenticated,
    ];

    let metric;
    if (this._flatlined) {
      metric = new Metrics.SocketSessionFlatline(...commonArgs);
    } else if (this._errorMessage) {
      metric = new Metrics.SocketSessionError(...commonArgs,
                                              this._errorMessage);
    } else {
      metric = new Metrics.SocketSession(...commonArgs);
    }

    api.metrics.add(metric);
  };

  _onInternalMessage: ((message: Object) => void) = (message) => {
    log.debug(`_onInternalMessage`, message);

    switch(message.name) {
    case `error`: {
      log.error(`Child error`, message.stack);
      const error = new Error(`Child error: '${message.message}'`);
      this.emit(`error`, error);
      break;
    }

    case `flatline`: {
      this._onFlatline();
      break;
    }

    case `rssi`: {
      this._onRssiUpdate(message.value);
      break;
    }

    case `authenticated`: {
      this._onAuthenticated(message.authenticated);
      break;
    }

    default:
      log.error(`Unhandled message`, message);
      throw new Error(`Unhandled message '${message.name}'`);
    }
  };

  _killRssiUpdates() {
    log.debug(`_killRssiUpdates`);

    if (this._rssiUpdatesKilled) {
      return;
    }

    this.rssiUpdatesEnabled = false;
    this._rssiUpdatesKilled = true;
  }

  end(
    chunkOrEncodingOrCallback?: string | Buffer | Function,
    encodingOrCallback?: string | Function,
    callback?: Function
  ): void {
    log.debug(`end`);

    if (!this._ending) {
      this._killRssiUpdates();
      this._ending = true;
    }

    return super.end(chunkOrEncodingOrCallback, encodingOrCallback, callback);
  }

  get connected(): boolean {
    return !this._ending && !this._ended;
  }

  get rssi(): number {
    return this._rssiValue;
  }

  get rssiUpdatesEnabled(): boolean {
    return this._rssiUpdatesEnabled;
  }

  set rssiUpdatesEnabled(val: boolean): void {
    log.debug(`rssiUpdatesEnabled`, val);

    if (this._rssiUpdatesKilled) {
      return;
    }

    val = val ? true : false;
    if (this.rssiUpdatesEnabled === val) {
      return;
    }

    this._internalStream.writeInternal(createInternalMessage({
      name: `rssi`,
      enabled: val,
    }));

    this._rssiUpdatesEnabled = val;
  }

  get authenticated(): boolean {
    return this._authenticated;
  }

  allowUnauthenticated(): void {
    log.debug(`allowUnauthenticated`);

    if (this._emittedUnauthenticated) {
      throw new Error(`Called allowUnauthenticated() too late`);
    }

    if (this._allowUnauthenticated) {
      return;
    }
    this._allowUnauthenticated = true;

    if (this._authenticated) {
      return;
    }

    this._internalStream.writeInternal(createInternalMessage({
      name: `allowUnauthenticated`,
      allow: true,
    }));
  }

  startScanning(): void {
    log.debug(`startScanning`);

    this._internalStream.writeInternal(createInternalMessage({
      name: `scan`,
      enabled: true,
    }));
  }

  stopScanning(): void {
    log.debug(`stopScanning`);

    this._internalStream.writeInternal(createInternalMessage({
      name: `scan`,
      enabled: false,
    }));
  }

  skip() {
    log.debug(`skip`);

    this._internalStream.writeInternal(createInternalMessage({
      name: `skip`,
      enabled: true,
    }));
  }

  unskip() {
    log.debug(`unskip`);

    this._internalStream.writeInternal(createInternalMessage({
      name: `skip`,
      enabled: false,
    }));
  }
}
