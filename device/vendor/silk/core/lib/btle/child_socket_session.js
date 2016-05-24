/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import assert from 'assert';
import {RssiSmoother} from 'silk-api';
import {
  AuthenticateDuplexStream,
  CryptoDuplexStream,
  HeartbeatDuplexStream,
  MessagePackDuplexStream,
} from 'silk-streams';
import path from 'path';

import BluetoothStream from './bluetooth_stream';
import createLog from '../log';
import api from '../api';
import * as Metrics from '../metrics/btle';
import {getboolprop, playSound} from '../sysutils';

import type {Peripheral} from 'noble';
import type SocketScanner from './socket_scanner';

const log = createLog(`btle-child-socketsession`);

const HEARTBEAT_SOUNDS_ENABLED = getboolprop('persist.silk.heartbeatSounds');
const HEARTBEAT_SOUND_FILE = path.join(__dirname, 'media', 'heartbeat.mp3');
const FLATLINE_SOUND_FILE = path.join(__dirname, 'media', 'flatline.mp3');

export default class ChildSocketSession extends AuthenticateDuplexStream {

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

  // Stuff that gets tracked for metrics.
  _startTime: number = Date.now();
  _receivedBytes: number = 0;
  _sentBytes: number = 0;
  _flatlined: boolean = false;
  _errorMessage: string = ``;

  constructor(scanner: SocketScanner, peripheral: Peripheral) {
    log.debug(`constructor`);

    const bluetoothStream =
      new BluetoothStream(peripheral, scanner._serviceUuid);
    const cryptoStream = new CryptoDuplexStream(bluetoothStream, api.metrics);

    const msgpackStream = new MessagePackDuplexStream(cryptoStream);
    msgpackStream.on(`data`, (data) => {
      log.verbose(`Received`, data);
    });
    const msgpackOldWrite = msgpackStream.write;
    msgpackStream.write = (data, ...args) => {
      log.verbose(`Sending`, data);
      return msgpackOldWrite.call(msgpackStream, data, ...args);
    };

    const heartbeatStream = new HeartbeatDuplexStream(msgpackStream);

    super(heartbeatStream,
          cryptoStream,
          scanner._privateKey,
          scanner._publicKeys,
          api.metrics);

    this._scanner = scanner;

    peripheral.addListener(`rssiUpdate`, this._onPeripheralRssiUpdate);
    peripheral.addListener(`disconnect`, this._onPeripheralDisconnect);
    this._peripheral = peripheral;

    this._rssiSmoother.update(peripheral.rssi);

    this.once(`end`, this._onEnd);
    this.once(`error`, this._onError);
    this.once(`close`, this._onClose);

    bluetoothStream.on(`data`, (data) => {
      this._receivedBytes += data.length;
    });
    const socketOldWrite = bluetoothStream.write;
    bluetoothStream.write = (data, encoding, callback) => {
      if (data) {
        this._sentBytes += data.length;
      }
      return socketOldWrite.call(bluetoothStream, data, encoding, callback);
    };

    heartbeatStream.once(`data`, () => {
      log.debug(`Heartbeat stream received first data event, starting ` +
                `monitoring`);

      heartbeatStream.on(`flatline`, this._onFlatline);
      if (HEARTBEAT_SOUNDS_ENABLED) {
        heartbeatStream.on(`heartbeat`, () => playSound(HEARTBEAT_SOUND_FILE));
      }
      heartbeatStream.monitorHeartbeats = true;

      // Waiting to unpack entire messages can take longer than we would like
      // sometimes so reset the monitor whenever the bluetooth stream receives
      // data.
      bluetoothStream.addListener(`data`, () => heartbeatStream.resetMonitor());
    });
  }

  _onPeripheralRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`_onPeripheralRssiUpdate`, rssi);

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
    log.debug(`_onPeripheralDisconnect`);

    assert(!this._peripheralDisconnected);

    this._peripheralDisconnected = true;

    this._peripheral.removeListener(`disconnect`, this._onPeripheralDisconnect);

    this._killRssiUpdates();
  };

  _onFlatline: (() => void) = () => {
    log.debug(`_onFlatline`);

    this._flatlined = true;

    const error = new Error(
      `Failed to receive heartbeat message in expected time`
    );
    log.warn(error);
    this.emit(`error`, error);

    if (HEARTBEAT_SOUNDS_ENABLED) {
      playSound(FLATLINE_SOUND_FILE);
    }
  };

  _onEnd: (() => void) = () => {
    log.debug(`_onEnd`);

    this._ended = true;

    this._killRssiUpdates();
  };

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`_onError`, error);

    if (!this._errorMessage) {
      this._errorMessage = error.message;
    }

    this._ended = true;

    this._killRssiUpdates();

    // Force-close both ends of the stream.
    this.end();
    this.push(null);
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

  _onTime: (() => void) = () => {
    log.debug(`_onTime`);

    // Avoid negative session durations if the time changed and it is somehow
    // before our start time.
    const now = Date.now();
    if (this._startTime > now) {
      this._startTime = now;
    }
  };

  _killRssiUpdates() {
    log.debug(`_killRssiUpdates`);

    this.rssiUpdatesEnabled = false;
    this._peripheral.removeListener(`rssiUpdate`, this._onPeripheralRssiUpdate);
  }

  _updateRssiAfterDelay() {
    log.debug(`_updateRssiAfterDelay`);
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
    }, ChildSocketSession.RSSI_UPDATE_TIMEOUT);
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

  startScanning(): void {
    log.debug(`startScanning`);

    this._scanner.start();
  }

  stopScanning(): void {
    log.debug(`stopScanning`);

    this._scanner.stop();
  }

  skip() {
    log.debug(`skip`);

    this._scanner.addToSkipList(this._peripheral);
  }

  unskip() {
    log.debug(`unskip`);

    this._scanner.removeFromSkipList(this._peripheral);
  }
}
