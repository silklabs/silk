import assert from 'assert';
import makeLog from '../log';
import Stream from './stream';
import { RssiSmoother, streams } from 'silk-api-react-native';

const { CryptoDuplexStream } = streams.crypto;
const { MessagePackDuplexStream } = streams.msgpack;

const log = makeLog(`btle-SocketSession`);

const RSSI_UPDATE_TIMEOUT = 100;

export default class SocketSession extends MessagePackDuplexStream {
  _socket = null;

  _disconnecting = false;
  _sentDisconnect = false;
  _finished = false;

  _rssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled = false;
  _rssiUpdatePending = false;
  _rssiValue = 0;
  _rssiTimeout = null;

  constructor(socket) {
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

  _onSocketRssiUpdate = rssi => {
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

  _onSocketDisconnect = () => {
    log.debug(`SocketSession._onSocketDisconnect()`);

    this._killRssiUpdates();
  };

  _onEnd = () => {
    log.debug(`SocketSession._onEnd()`);

    this._killRssiUpdates();
  };

  _onFinish = () => {
    log.debug(`SocketSession._onFinish()`);

    assert(!this._rssiUpdatesEnabled);
    assert(!this._finished);

    this._finished = true;

    if (!this._sentDisconnect) {
      this._sendDisconnect();
    }
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

      this._peripheral.updateRssi();
    }, RSSI_UPDATE_TIMEOUT);
  }

  _sendDisconnect() {
    log.debug(`SocketSession._sendDisconnect()`);
    assert(!this._sentDisconnect);

    this._sentDisconnect = true;

    this._socket.write({ name: `disconnect` });
  }

  get connected() {
    return !this._disconnecting;
  }

  get rssi() {
    return this._rssiValue;
  }

  get rssiUpdatesEnabled() {
    return this._rssiUpdatesEnabled;
  }

  set rssiUpdatesEnabled(val) {
    val = val ? true : false;
    if (this.rssiUpdatesEnabled === val) {
      return;
    }

    this._rssiUpdatesEnabled = val;

    if (this.rssiUpdatesEnabled) {
      assert(this._peripheral);
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

    if (!this._finished) {
      // We will disconnect in |_onFinish()| after all the data that was written
      // has been sent.
      this.end();
    } else {
      // Disconnect immediately.
      this._sendDisconnect();
    }
  }
}
