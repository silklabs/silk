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

import api from 'silk-device-api';
import createLog from 'silk-log/device';
import {createMessage as createInternalMessage} from './socket_message_utils';
import InternalMessageFilterStream from './internal_message_stream';
import * as Metrics from '../metrics/btle';

import type {Socket} from 'net';
import type {AuthenticateStatus} from 'silk-streams/src/authenticate';

const log = createLog(`btle-parent-socketsession`);

export default class ParentSocketSession extends DuplexTransform {

  // Set to true when |end()| is called.
  _ending: boolean = false;

  // Set to true once the 'end' or 'error' event is emitted.
  _ended: boolean = false;

  _rssiValue: number = 0;
  _rssiUpdatesEnabled: boolean = false;
  _rssiUpdatesKilled: boolean = false;

  _status: AuthenticateStatus = 'unknown';
  _publicKey: ?string = null;
  _allowCalled: boolean = false;

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
      log.verbose(`Received`, data.name || data);
    });
    const msgpackOldWrite = msgpackStream.write.bind(msgpackStream);
    msgpackStream.write = (data, encodingOrCallback, callback) => {
      log.verbose(`Sending`, data.name || data);
      return msgpackOldWrite(data, encodingOrCallback, callback);
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
      this.status,
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

    switch (message.name) {
    case `error`: {
      log.error(`Child error`, message.stack);
      const error = new Error(`Child error: '${message.message}'`);
      this.emit(`error`, error);
      break;
    }

    case `status`: {
      const {name, status, publicKey} = message;
      this._status = status;
      if (publicKey) {
        this._publicKey = publicKey;
      }
      this.emit(name, status);
      break;
    }

    case `unauthenticated`: {
      this.emit(message.name);
      break;
    }

    case `authenticated`: {
      this._publicKey = message.publicKey;
      this.emit(message.name);
      break;
    }

    case `paired`: {
      this._publicKey = message.publicKey;
      this.emit(message.name);
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

  allow(allowed: boolean): void {
    log.debug(`allow`, allowed);

    invariant(!this._allowCalled);
    this._allowCalled = true;

    this._internalStream.writeInternal(createInternalMessage({
      name: `allow`,
      allowed,
    }));
  }

  setPaired(publicKey: string): void {
    log.debug(`setPaired`, publicKey);

    invariant(this._status === 'unauthenticated' ||
              this._status === 'authenticated');
    if (this._status === 'authenticated') {
      invariant(this._publicKey === publicKey);
    }

    this._status = 'paired';
    this._publicKey = publicKey;

    this._internalStream.writeInternal(createInternalMessage({
      name: `setPaired`,
      publicKey,
    }));
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

  get publicKey(): ?string {
    return this._publicKey;
  }

  get status(): AuthenticateStatus {
    return this._status;
  }

  get authenticated(): boolean {
    return this._status === 'authenticated' || this._status === 'paired';
  }

  get paired(): boolean {
    return this._status === 'paired';
  }

}
