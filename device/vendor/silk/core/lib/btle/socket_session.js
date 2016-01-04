/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import assert from 'assert';
import Stream from './stream';
import { createStreams, RssiSmoother } from 'silk-api';
import makeLog from '../log';

import type { Peripheral } from 'noble';
import type SocketScanner from './socket_scanner';

const {
  AuthenticateDuplexStream,
  CryptoDuplexStream,
  HeartbeatDuplexStream,
  MessagePackDuplexStream,
} = createStreams();

const log = makeLog(`btle-socketsession`);

export default class SocketSession extends AuthenticateDuplexStream {

  static RSSI_UPDATE_TIMEOUT = 50;

  _scanner: SocketScanner;
  _peripheral: Peripheral;

  // Set to true when |end()| is called.
  _ending: boolean = false;

  // Set to true once the 'end' or 'error' event is emitted.
  _ended: boolean = false;

  // Set to true after the peripheral has been disconnected.
  _peripheralDisconnected: boolean = false;

  _rssiSmoother: RssiSmoother = new RssiSmoother();
  _rssiUpdatesEnabled: boolean = false;
  _rssiUpdatePending: boolean = false;
  _rssiValue: number = 0;
  _rssiTimeout: ?number = null;

  constructor(scanner: SocketScanner, peripheral: Peripheral) {
    log.debug(`SocketSession()`);

    const socketStream = new Stream(peripheral, scanner._serviceUuid);
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
      log.debug(`Heartbeat stream received first data event, starting monitoring`);

      heartbeatStream.addListener(`flatline`, this._onFlatline);
      heartbeatStream.monitorHeartbeats = true;

      // Waiting to unpack entire messages can take longer than we would like
      // sometimes so reset the monitor whenever the bluetooth stream receives
      // data.
      socketStream.addListener(`data`, () => heartbeatStream.resetMonitor());
    });
  }

  _onPeripheralRssiUpdate: ((rssi: number) => void) = (rssi) => {
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

  _onPeripheralDisconnect: (() => void) = () => {
    log.debug(`SocketSession._onPeripheralDisconnect()`);

    assert(!this._peripheralDisconnected);

    this._peripheralDisconnected = true;

    this._peripheral.removeListener(`disconnect`, this._onPeripheralDisconnect);

    this._killRssiUpdates();
  };

  _onFlatline: (() => void) = () => {
    log.debug(`SocketSession._onFlatline()`);

    const error = new Error(`Failed to receive heartbeat message in expected ` +
                            `time`);
    log.warn(error);
    this.emit(`error`, error);
  };

  _onEnd: (() => void) = () => {
    log.debug(`SocketSession._onEnd()`);

    this._ended = true;

    this._killRssiUpdates();
  };

  _onError: ((error: Error) => void) = (error) => {
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

  emit(eventName: string, ...args: Array<any>): boolean {
    if (eventName === `close` && !this._peripheralDisconnected) {
      log.debug(`Stream is closed, disconnecting peripheral before emitting ` +
                `the '${eventName}' event`);
      this._peripheral.disconnect(() => {
        log.debug(`Emitting the '${eventName}' event`);
        super.emit(eventName, ...args);
      });
      return true;
    }

    return super.emit(eventName, ...args);
  }

  end(
    chunkOrEncodingOrCallback?: string | Buffer | Function,
    encodingOrCallback?: string | Function,
    callback?: Function
  ): void {
    log.debug(`SocketSession.end()`);

    if (!this._ending) {
      this._killRssiUpdates();
      this._ending = true;
    }

    return super.end(chunkOrEncodingOrCallback, encodingOrCallback, callback);
  }

  get scanner(): SocketScanner {
    return this._scanner;
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
