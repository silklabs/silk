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

const streams = createStreams();
const { CryptoDuplexStream, MessagePackDuplexStream } = streams;

const log = makeLog(`btle-socketsession`);

const RSSI_UPDATE_TIMEOUT = 100;

export default class SocketSession extends MessagePackDuplexStream {
  _scanner = null;
  _peripheral = null;

  _disconnecting = false;
  _disconnectedPeripheral = false;
  _finished = false;

  _rssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled = false;
  _rssiUpdatePending = false;
  _rssiValue = 0;
  _rssiTimeout = null;

  constructor(scanner, peripheral, serviceUuid) {
    log.debug(`SocketSession()`);

    let stream = new ClientStream(peripheral, serviceUuid);
    stream = new CryptoDuplexStream(stream);

    super(stream);

    this._scanner = scanner;

    peripheral.addListener(`rssiUpdate`, this._onPeripheralRssiUpdate);
    peripheral.addListener(`disconnect`, this._onPeripheralDisconnect);
    this._peripheral = peripheral;

    this._rssiSmoother.update(peripheral.rssi);

    this.once(`end`, this._onEnd);
    this.once(`finish`, this._onFinish);
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

    if (!this._disconnectedPeripheral) {
      this._disconnectedPeripheral = true;
      this._peripheral.disconnect();
    }
  };

  _killRssiUpdates() {
    log.debug(`SocketSession._killRssiUpdates()`);

    this.rssiUpdatesEnabled = false;
    this._peripheral.removeListener(`rssiUpdate`, this._onPeripheralRssiUpdate);
    this._peripheral.removeListener(`disconnect`, this._onPeripheralDisconnect);
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

  skip() {
    log.debug(`SocketSession.skip()`);

    this._scanner.addToSkipList(this._peripheral);
  }

  unskip() {
    log.debug(`SocketSession.unskip()`);

    this._scanner.removeFromSkipList(this._peripheral);
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
      // We will disconnect the peripheral in |_onFinish()| after all the
      // data that was written has been sent.
      this.end();
    } else {
      // Disconnect immediately. This will trigger an 'end' event if we haven't
      // gotten one already.
      this._disconnectedPeripheral = true;
      this._peripheral.disconnect();
    }
  }
}
