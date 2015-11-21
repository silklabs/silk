/**
 * @flow
 */

import assert from 'assert';
import { createStreams, RssiSmoother } from 'silk-api';
import { getRandomBytes } from '../Crypto';
import makeLog from 'log';
import Stream from './Stream';

import type { Socket } from './SocketManager';

const streams = createStreams({
  getRandomBytes,
});

const { CryptoDuplexStream, MessagePackDuplexStream } = streams;

const log = makeLog(`btle-SocketSession`);

export default class SocketSession extends MessagePackDuplexStream {
  static RSSI_UPDATE_TIMEOUT = 50;

  _socket: Socket;

  _disconnecting: boolean = false;
  _sentDisconnect: boolean = false;
  _finished: boolean = false;

  _rssiSmoother: RssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled: boolean = false;
  _rssiUpdatePending: boolean = false;
  _rssiValue: number = 0;
  _rssiTimeout: ?number = null;

  constructor(socket: Socket) {
    log.debug(`SocketSession()`);

    let stream = new Stream(socket);
    stream = new CryptoDuplexStream(stream);

    super(stream);

    socket.addListener(`rssiUpdate`, this._onSocketRssiUpdate);
    socket.addListener(`disconnect`, this._onSocketDisconnect);
    this._socket = socket;

    this.once(`end`, this._onEnd);
    this.once(`finish`, this._onFinish);
  }

  _onSocketRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`SocketSession._onSocketRssiUpdate(${rssi})`);

    this._rssiSmoother.update(rssi);

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

  _onSocketDisconnect: (() => void) = () => {
    log.debug(`SocketSession._onSocketDisconnect()`);

    this._killRssiUpdates();
  };

  _onEnd: (() => void) = () => {
    log.debug(`SocketSession._onEnd()`);

    this._killRssiUpdates();
  };

  _onFinish: (() => void) = () => {
    log.debug(`SocketSession._onFinish()`);

    assert(!this._rssiUpdatesEnabled);
    assert(!this._finished);

    this._finished = true;
  };

  _killRssiUpdates() {
    log.debug(`SocketSession._killRssiUpdates()`);

    this.rssiUpdatesEnabled = false;
    this._socket.removeListener(`rssiUpdate`, this._onSocketRssiUpdate);
    this._socket.removeListener(`disconnect`, this._onSocketDisconnect);
  }

  _updateRssiAfterDelay() {
    log.debug(`SocketSession._updateRssiAfterDelay()`);
    if (!this._rssiUpdatesEnabled ||
        this._rssiTimeout ||
        this._rssiUpdatePending) {
      return;
    }

    this._rssiTimeout = setTimeout(() => {
      assert(this._rssiUpdatesEnabled);
      assert(!this._rssiUpdatePending);

      this._rssiTimeout = null;
      this._rssiUpdatePending = true;

      this._socket.updateRssi();
    }, SocketSession.RSSI_UPDATE_TIMEOUT);
  }

  _sendDisconnect() {
    log.debug(`SocketSession._sendDisconnect()`);
    assert(!this._sentDisconnect);

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

  set rssiUpdatesEnabled(val) {
    val = val ? true : false;
    if (this.rssiUpdatesEnabled === val) {
      return;
    }

    this._rssiUpdatesEnabled = val;

    if (this.rssiUpdatesEnabled) {
      assert(this._socket);
      assert(!this._rssiTimeout);
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
