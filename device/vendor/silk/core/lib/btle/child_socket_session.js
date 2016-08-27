/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import {RssiSmoother} from 'silk-api';
import {
  AuthenticateDuplexStream,
  CryptoDuplexStream,
  MessagePackDuplexStream,
} from 'silk-streams';

import createLog from 'silk-log/device';
import api from 'silk-device-api';
import * as Metrics from '../metrics/btle';

import type {Peripheral} from 'noble';
import type SocketStream from './socket_stream';

const log = createLog(`btle-child-socketsession`);

export default class ChildSocketSession extends AuthenticateDuplexStream {

  static RSSI_UPDATE_TIMEOUT = 50;

  _peripheral: Peripheral;
  _accountDeviceNumber: number;

  // Set to true when |end()| is called.
  _ending: boolean = false;

  // Set to true once the 'end' or 'error' event is emitted.
  _ended: boolean = false;

  // Set to true when the peripheral has been disconnected.
  _disconnected: boolean = false;

  _rssiSmoother: RssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled: boolean = false;
  _rssiUpdatePending: boolean = false;
  _rssiValue: number = 0;
  _rssiTimeout: ?number = null;

  // Stuff that gets tracked for metrics.
  _startTime: number = Date.now();
  _receivedBytes: number = 0;
  _sentBytes: number = 0;
  _errorMessage: string = ``;

  _msgpackStream: ?MessagePackDuplexStream;

  constructor(
    stream: SocketStream,
    peripheral: Peripheral,
    privateKey: string,
    publicKeys: Array<string>,
    accountDeviceNumber: number,
  ) {
    log.debug(`constructor`);

    const cryptoStream = new CryptoDuplexStream(stream, api.metrics);

    const msgpackStream = new MessagePackDuplexStream(cryptoStream);
    msgpackStream.on(`data`, (data) => {
      log.verbose(`Received`, data.name || data);
    });
    const msgpackOldWrite = msgpackStream.write.bind(msgpackStream);
    msgpackStream.write = (data, encodingOrCallback, callback) => {
      log.verbose(`Sending`, data.name || data);
      return msgpackOldWrite(data, encodingOrCallback, callback);
    };

    super(msgpackStream,
          cryptoStream,
          privateKey,
          publicKeys);

    this._accountDeviceNumber = accountDeviceNumber;
    this._msgpackStream = msgpackStream;

    peripheral.addListener(`rssiUpdate`, this._onRssiUpdate);
    peripheral.addListener(`disconnect`, this._onDisconnect);
    this._peripheral = peripheral;

    this.once(`end`, this._onEnd);
    this.once(`error`, this._onError);
    this.once(`close`, this._onClose);

    stream.on(`data`, (data) => {
      this._receivedBytes += data.length;
    });
    const streamOldWrite = stream.write.bind(stream);
    stream.write = (data, encoding, callback) => {
      if (data) {
        this._sentBytes += data.length;
      }
      return streamOldWrite(data, encoding, callback);
    };
  }

  _onDisconnect: (() => void) = () => {
    log.debug(`_onDisconnect`);

    this._disconnected = true;
    this._peripheral.removeListener(`disconnect`, this._onDisconnect);
  };

  _onRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`_onRssiUpdate`, rssi);

    this._rssiSmoother.update(rssi);

    if (!this._rssiUpdatePending) {
      // Someone else triggered this update. Just ignore.
      return;
    }

    this._rssiUpdatePending = false;

    const lastRssiValue = this._rssiValue;
    this._rssiValue = this._rssiSmoother.value;

    if (this._rssiUpdatesEnabled) {
      if (this._rssiValue !== lastRssiValue) {
        this.emit(`rssiUpdate`, this._rssiValue);
      }
      this._updateRssiAfterDelay();
    }
  };

  _onEnd: (() => void) = () => {
    log.debug(`_onEnd`);

    this._ended = true;

    this._killRssiUpdates();

    // Stop sending more data.
    this.end();
  };

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`_onError`, error);

    if (!this._errorMessage) {
      this._errorMessage = error.message;
    }

    this._disconnect();
  };

  _onClose: (() => void) = () => {
    log.debug(`_onClose`);

    const duration = Math.max(Date.now() - this._startTime, 0);

    this._disconnect();

    const commonArgs = [
      duration,
      this._receivedBytes,
      this._sentBytes,
      this.authenticated,
    ];

    let metric;
    if (this._errorMessage) {
      metric = new Metrics.SocketSessionError(...commonArgs,
                                              this._errorMessage);
    } else {
      metric = new Metrics.SocketSession(...commonArgs);
    }

    this.emit(`metrics`, metric);
  };

  _onTime: (() => void) = () => {
    log.debug(`_onTime`);

    // Avoid negative session durations if the time changed and it is somehow
    // before our start time.
    const now = Date.now();
    if (this._startTime > now) {
      this._startTime = now;
    }
  };

  _disconnect() {
    log.debug(`_disconnect`);

    if (this._disconnected) {
      return;
    }

    this._disconnected = true;

    this._ended = true;
    this._killRssiUpdates();

    this._peripheral.removeListener(`disconnect`, this._onDisconnect);
    this._peripheral.disconnect();
  }

  _killRssiUpdates() {
    log.debug(`_killRssiUpdates`);

    this.rssiUpdatesEnabled = false;
    this._peripheral.removeListener(`rssiUpdate`, this._onRssiUpdate);
  }

  _updateRssiAfterDelay() {
    log.debug(`_updateRssiAfterDelay`);
    if (!this._rssiUpdatesEnabled ||
        this._rssiTimeout ||
        this._rssiUpdatePending) {
      return;
    }

    this._rssiTimeout = setTimeout(() => {
      invariant(this._rssiUpdatesEnabled);
      invariant(!this._rssiUpdatePending);

      this._rssiTimeout = null;
      this._rssiUpdatePending = true;

      this._peripheral.updateRssi();
    }, ChildSocketSession.RSSI_UPDATE_TIMEOUT);
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

  sendAuthFailure(): void {
    log.debug(`sendAuthFailure`);

    invariant(this._accountDeviceNumber > 0);

    const stream = this._msgpackStream;
    this._msgpackStream = null;

    if (stream) {
      stream.write({
        name: `unauthorized`,
        accountDeviceNumber: this._accountDeviceNumber,
      });
      stream.end();
    }
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

  set rssiUpdatesEnabled(val: boolean) {
    val = val ? true : false;
    if (this.rssiUpdatesEnabled === val) {
      return;
    }

    this._rssiUpdatesEnabled = val;

    if (this.rssiUpdatesEnabled) {
      invariant(this._peripheral);
      invariant(!this._rssiTimeout);
      if (!this._rssiUpdatePending) {
        this._updateRssiAfterDelay();
      }
    } else {
      if (this._rssiTimeout) {
        clearTimeout(this._rssiTimeout);
        this._rssiTimeout = null;
      }
    }
  }
}
