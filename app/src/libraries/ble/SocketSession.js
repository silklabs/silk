/**
 * @flow
 */

import invariant from 'assert';
import { RssiSmoother } from 'silk-api';
import makeLog from 'silk-log';
import {
  AuthenticateDuplexStream,
  CryptoDuplexStream,
  MessagePackDuplexStream,
} from 'silk-streams';

import * as Metrics from '../../metrics/BTLE';
import Stream from './Stream';

import type MetricsAgent from 'silk-api/src/metrics_agent';
import type {Socket} from 'silk-ble-socket';

const log = makeLog(`btle-SocketSession`);

export default class SocketSession extends AuthenticateDuplexStream {

  _socket: Socket;
  _privateKey: string;
  _publicKeys: Array<string>;

  _disconnecting: boolean = false;
  _finished: boolean = false;

  _rssiSmoother: RssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled: boolean = false;
  _rssiValue: number = -80;

  // Stuff that gets tracked for metrics.
  _startTime: number = Date.now();
  _receivedBytes: number = 0;
  _sentBytes: number = 0;
  _errorMessage: string = ``;

  constructor(socket: Socket,
              privateKey: string,
              publicKeys: Array<string>,
              metrics: MetricsAgent) {
    log.debug(`constructor`);

    invariant(metrics);

    const socketStream = new Stream(socket);
    const cryptoStream = new CryptoDuplexStream(
      socketStream,
      metrics
    );

    const msgpackStream = new MessagePackDuplexStream(cryptoStream);
    msgpackStream.on(`data`, (data) => {
      log.verbose(`Received`, data.name || data);
    });
    const msgpackOldWrite = msgpackStream.write.bind(msgpackStream);
    msgpackStream.write = (data, encodingOrCallback, callback) => {
      log.verbose(`Sending`, data.name || data);
      return msgpackOldWrite(data, encodingOrCallback, callback);
    };

    super(
      msgpackStream,
      cryptoStream,
      privateKey,
      publicKeys,
      metrics
    );

    socket.addListener(`rssiUpdate`, this._onSocketRssiUpdate);
    socket.addListener(`disconnect`, this._onSocketDisconnect);
    this._socket = socket;

    this.once(`end`, this._onEnd);
    this.once(`error`, this._onError);
    this.once(`finish`, this._onFinish);
    this.once(`close`, this._onClose);

    this.once(`unauthenticated`, () => {
      log.info(`Receiving unauthenticated data`);
      // XXX Someday maybe be smarter about when to accept unauthenticated data.
      this.allowUnauthenticated(true);
    });

    socketStream.on(`data`, (data) => {
      this._receivedBytes += data.length;
    });
    const socketOldWrite = socketStream.write.bind(socketStream);
    socketStream.write = (data, encodingOrCallback, callback) => {
      if (data) {
        this._sentBytes += data.length;
      }
      return socketOldWrite(data, encodingOrCallback, callback);
    };
  }

  _onSocketRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`_onSocketRssiUpdate`, rssi);

    if (!this._rssiUpdatesEnabled) {
      return;
    }

    this._rssiSmoother.update(rssi);

    const lastRssiValue = this._rssiValue;
    this._rssiValue = this._rssiSmoother.value;

    if (this._rssiValue !== lastRssiValue) {
      this.emit(`rssiUpdate`, this._rssiValue);
    }
  };

  _onSocketDisconnect: (() => void) = () => {
    log.debug(`_onSocketDisconnect`);

    this._killRssiUpdates();
  };

  _onEnd: (() => void) = () => {
    log.debug(`_onEnd`);

    this._killRssiUpdates();
  };

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`_onError`, error);

    if (this._errorMessage) {
      log.warn(`Multiple error events`, error);
      return;
    }

    log.warn(error);
    this._errorMessage = error.toString();
  };

  _onFinish: (() => void) = () => {
    log.debug(`_onFinish`);

    invariant(!this._rssiUpdatesEnabled);
    invariant(!this._finished);

    this._finished = true;
  };

  _onClose: (() => void) = () => {
    log.debug(`_onClose`);

    const commonArgs = [
      Date.now() - this._startTime,
      this._receivedBytes,
      this._sentBytes,
      this.authenticated,
    ];

    const metric = this._errorMessage ?
                   new Metrics.SocketSessionError(...commonArgs,
                                                  this._errorMessage) :
                   new Metrics.SocketSession(...commonArgs);
    this.emit(`metrics`, metric);

    this._socket.disconnect();
  };

  _killRssiUpdates() {
    log.debug(`_killRssiUpdates`);

    this.rssiUpdatesEnabled = false;
    this._socket.removeListener(`rssiUpdate`, this._onSocketRssiUpdate);
    this._socket.removeListener(`disconnect`, this._onSocketDisconnect);
  }

  get connected(): boolean {
    return !this._disconnecting;
  }

  get rssi(): number {
    return this._rssiValue;
  }

  get rssiUpdatesEnabled(): boolean {
    return this._rssiUpdatesEnabled;
  }

  set rssiUpdatesEnabled(val: boolean) {
    val = !!val;
    if (this.rssiUpdatesEnabled === val) {
      return;
    }

    this._rssiUpdatesEnabled = val;
    this._socket.enableRssiUpdates(val);
  }

  disconnect() {
    log.debug(`disconnect`);

    if (this._disconnecting) {
      log.info(`Already disconnecting`);
      return;
    }

    this._disconnecting = true;

    this._killRssiUpdates();

    this.end();
  }
}
