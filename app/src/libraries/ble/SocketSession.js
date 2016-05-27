/**
 * @flow
 */

import invariant from 'assert';
import { RssiSmoother } from 'silk-api';
import makeLog from 'silk-log';
import {
  AuthenticateDuplexStream,
  CryptoDuplexStream,
  EllipticJSKeyPair,
  HeartbeatDuplexStream,
  MessagePackDuplexStream,
} from 'silk-streams';

import { genRandomBytes } from '../Crypto';
import * as Metrics from '../../metrics/BTLE';
import Stream from './Stream';

import type MetricsAgent from 'silk-api/src/metrics_agent';
import type { Socket } from './SocketManager';

const log = makeLog(`btle-SocketSession`);

function genKeyPair() {
  return EllipticJSKeyPair.gen(genRandomBytes);
}

export default class SocketSession extends AuthenticateDuplexStream {

  _socket: Socket;
  _privateKey: string;
  _publicKeys: Array<string>;
  _heartbeatStream: HeartbeatDuplexStream;

  _disconnecting: boolean = false;
  _sentDisconnect: boolean = false;
  _finished: boolean = false;

  _rssiSmoother: RssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled: boolean = false;
  _rssiValue: number = -80;

  _metrics: MetricsAgent;

  // Stuff that gets tracked for metrics.
  _startTime: number = Date.now();
  _receivedBytes: number = 0;
  _sentBytes: number = 0;
  _errorMessage: string = ``;

  constructor(socket: Socket,
              privateKey: string,
              publicKeys: Array<string>,
              metrics: MetricsAgent) {
    log.debug(`SocketSession()`);

    invariant(metrics);

    const socketStream = new Stream(socket);
    const cryptoStream = new CryptoDuplexStream(
      genKeyPair,
      genRandomBytes,
      socketStream,
      metrics
    );

    const msgpackStream = new MessagePackDuplexStream(cryptoStream);
    msgpackStream.on(`data`, (data) => {
      log.verbose(`Received`, data.name);
    });
    const msgpackOldWrite = msgpackStream._write;
    msgpackStream._write = (data, encoding, callback) => {
      log.verbose(`Sending`, data.name);
      msgpackOldWrite.call(msgpackStream, data, encoding, callback);
    };

    const heartbeatStream = new HeartbeatDuplexStream(msgpackStream);

    super(
      heartbeatStream,
      cryptoStream,
      privateKey,
      publicKeys,
      metrics,
      { autoClose: false }
    );

    socket.addListener(`rssiUpdate`, this._onSocketRssiUpdate);
    socket.addListener(`disconnect`, this._onSocketDisconnect);
    this._socket = socket;

    heartbeatStream.sendHeartbeats = true;
    this._heartbeatStream = heartbeatStream;

    this.once(`end`, this._onEnd);
    this.once(`error`, this._onError);
    this.once(`finish`, this._onFinish);
    this.once(`close`, this._onClose);

    this.once(`unauthenticated`, () => {
      log.info(`Receiving unauthenticated data`);
      this.allowUnauthenticated(true);
    });

    socketStream.on(`data`, (data) => {
      this._receivedBytes += data.length;
    });
    const socketOldWrite = socketStream.write;
    socketStream.write = (data, encoding, callback) => {
      if (data) {
        this._sentBytes += data.length;
      }
      return socketOldWrite.call(socketStream, data, encoding, callback);
    };
  }

  _onSocketRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`SocketSession._onSocketRssiUpdate(${rssi})`);

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
    log.debug(`SocketSession._onSocketDisconnect()`);

    this._killRssiUpdates();
  };

  _onEnd: (() => void) = () => {
    log.debug(`SocketSession._onEnd()`);

    this._killRssiUpdates();
  };

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`SocketSession._onError()`);

    if (!this._errorMessage) {
      this._errorMessage = error.toString();
    }
  };

  _onFinish: (() => void) = () => {
    log.debug(`SocketSession._onFinish()`);

    invariant(!this._rssiUpdatesEnabled);
    invariant(!this._finished);

    this._finished = true;
  };

  _onClose: (() => void) = () => {
    log.debug(`SocketSession._onClose()`);

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
    this._metrics.add(metric);
  };

  _killRssiUpdates() {
    log.debug(`SocketSession._killRssiUpdates()`);

    this._heartbeatStream.sendHeartbeats = false;

    this.rssiUpdatesEnabled = false;
    this._socket.removeListener(`rssiUpdate`, this._onSocketRssiUpdate);
    this._socket.removeListener(`disconnect`, this._onSocketDisconnect);
  }

  _sendDisconnect() {
    log.debug(`SocketSession._sendDisconnect()`);
    invariant(!this._sentDisconnect);

    this._sentDisconnect = true;

    this.write({ name: `disconnect` });
    this.end();
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
    log.debug(`SocketSession.disconnect()`);

    if (this._disconnecting) {
      log.info(`Already disconnecting`);
      return;
    }

    this._disconnecting = true;

    this._killRssiUpdates();

    if (!this._finished && !this._sentDisconnect) {
      // We will disconnect in |_onFinish()| after all the data that was written
      // has been sent.
      this._sendDisconnect();
    }
  }
}
