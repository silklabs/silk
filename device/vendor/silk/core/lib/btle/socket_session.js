/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import { ClientStream } from './stream';
import { createStreams, RssiSmoother } from 'silk-api';
import makeLog from '../log';

const {
  AuthenticateDuplexStream,
  CryptoDuplexStream,
  HeartbeatDuplexStream,
  MessagePackDuplexStream,
} = createStreams();

const log = makeLog(`btle-socketsession`);

export default class SocketSession extends AuthenticateDuplexStream {

  static RSSI_UPDATE_TIMEOUT = 50;

  _scanner = null;
  _peripheral = null;

  // Set to true when |end()| is called.
  _ending = false;

  // Set to true once the 'end' or 'error' event is emitted.
  _ended = false;

  // Set to true after the peripheral has been disconnected.
  _peripheralDisconnected = false;

  _rssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled = false;
  _rssiUpdatePending = false;
  _rssiValue = 0;
  _rssiTimeout = null;

  constructor(scanner, peripheral) {
    log.debug(`SocketSession()`);

    const socketStream = new ClientStream(peripheral, scanner._serviceUuid);
    const cryptoStream = new CryptoDuplexStream(socketStream);

    const msgpackStream = new MessagePackDuplexStream(cryptoStream);
    msgpackStream.on(`data`, (data) => {
      log.verbose(`Received`, data);
    });
    const oldWrite = msgpackStream.write;
    msgpackStream.write = (data, ...args) => {
      log.verbose(`Sending`, data);
      return oldWrite.call(msgpackStream, data, ...args);
    };

    const heartbeatStream = new HeartbeatDuplexStream(msgpackStream);

    super(heartbeatStream,
          cryptoStream,
          scanner._privateKey,
          scanner._publicKeys);

    this._scanner = scanner;

    peripheral.addListener(`rssiUpdate`, this._onPeripheralRssiUpdate);
    peripheral.addListener(`disconnect`, this._onPeripheralDisconnect);
    this._peripheral = peripheral;

    this._rssiSmoother.update(peripheral.rssi);

    this.once(`end`, this._onEnd);
    this.once(`error`, this._onError);

    heartbeatStream.once(`data`, () => {
      log.debug(`Heartbeat stream received first data event, starting `+
                `monitoring`);

      heartbeatStream.addListener(`flatline`, this._onFlatline);
      heartbeatStream.monitorHeartbeats = true;

      // Waiting to unpack entire messages can take longer than we would like
      // sometimes so reset the monitor whenever the bluetooth stream receives
      // data.
      socketStream.addListener(`data`, () => heartbeatStream.resetMonitor());
    });
  }

  _onPeripheralRssiUpdate = rssi => {
    log.debug(`SocketSession._onPeripheralRssiUpdate(${rssi})`);

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

  _onPeripheralDisconnect = () => {
    log.debug(`SocketSession._onPeripheralDisconnect()`);

    assert(!this._peripheralDisconnected);

    this._peripheralDisconnected = true;

    this._peripheral.removeListener(`disconnect`, this._onPeripheralDisconnect);

    this._killRssiUpdates();
  };

  _onFlatline = () => {
    log.debug(`SocketSession._onFlatline()`);

    const error = new Error(`Failed to receive heartbeat message in expected ` +
                            `time`);
    log.warn(error);
    this.emit(`error`, error);
  };

  _onEnd = () => {
    log.debug(`SocketSession._onEnd()`);

    assert(!this._ended);
    this._ended = true;

    this._killRssiUpdates();
  };

  _onError = (error) => {
    log.debug(`SocketSession._onError('${error.toString()}')`);

    this._ended = true;

    this._killRssiUpdates();

    // Force-close both ends of the stream.
    this.end();
    this.push(null);
  };

  _killRssiUpdates() {
    log.debug(`SocketSession._killRssiUpdates()`);

    this.rssiUpdatesEnabled = false;
    this._peripheral.removeListener(`rssiUpdate`, this._onPeripheralRssiUpdate);
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
    }, SocketSession.RSSI_UPDATE_TIMEOUT);
  }

  emit(eventName, ...args) {
    if (eventName === `close` && !this._peripheralDisconnected) {
      log.debug(`Stream is closed, disconnecting peripheral before emitting ` +
                `the '${eventName}' event`);
      this._peripheral.disconnect(() => {
        log.debug(`Emitting the '${eventName}' event`);
        super.emit(eventName, ...args);
      });
      return;
    }

    return super.emit(eventName, ...args);
  }

  end(chunk, encoding, callback) {
    log.debug(`SocketSession.end()`);

    if (!this._ending) {
      this._killRssiUpdates();
      this._ending = true;
    }

    return super.end(chunk, encoding, callback);
  }

  get scanner() {
    return this._scanner;
  }

  get connected() {
    return !this._ending && !this._ended;
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

  skip() {
    log.debug(`SocketSession.skip()`);

    this._scanner.addToSkipList(this._peripheral);
  }

  unskip() {
    log.debug(`SocketSession.unskip()`);

    this._scanner.removeFromSkipList(this._peripheral);
  }
}
