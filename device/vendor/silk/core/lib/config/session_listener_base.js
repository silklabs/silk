/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/* eslint-disable no-multi-spaces */

import assert from 'assert';
import createLog from 'silk-log/device';
import version from 'silk-core-version';

const log = createLog('config-session-listener-base');

export default class SessionListenerBase {

  _deviceConfig = null;
  _socketSession = null;
  _disconnecting = false;

  constructor(deviceConfig, socketSession) {
    log.debug(`SessionListenerBase()`);

    assert(deviceConfig);
    assert(socketSession);

    this._deviceConfig = deviceConfig;
    this._socketSession = socketSession;

    socketSession.addListener(`data`, (data) => this._onData(data));
    socketSession.addListener(`error`, (error) => this._onError(error));
    socketSession.addListener(`rssiUpdate`, (rssi) => this._onRssiUpdate(rssi));

    this._send({
      name: `id`,
      // TODO: Something real here.
      manufacturer: `Silk Labs`,
      model: `SilkCam`,
      version: version.semver,
      image: new Uint8Array([ 0xfe, 0xfe, 0xfe, 0xfe ]),
    });
  }

  sendStatus(status) {
    log.debug(`SessionListenerBase.sendStatus('${status}')`);

    this._send({
      name: `status`,
      status,
    });
  }

  sendWifiScanResults(scanResults) {
    log.debug(`SessionListenerBase.sendWifiScanResults()`);

    this._send({
      name: `wifiscan`,
      networks: scanResults,
    });
  }

  sendError(code) {
    log.debug(`SessionListenerBase.sendStatus('${code}')`);

    this._send({
      name: `error`,
      code,
    });
  }

  disconnect() {
    log.debug(`SessionListenerBase.disconnect()`);

    if (this._disconnecting) {
      return;
    }

    this._disconnecting = true;

    if (this._socketSession) {
      this._socketSession.end();
      this._socketSession = null;
    }
  }

  _send(data) {
    if (!this._socketSession) {
      log.warn(`Unable to send because socketSession has already disconnected`,
               data);
      return;
    }

    log.debug(`SessionListenerBase._send()`, data);
    this._socketSession.write(data);
  }

  _onError(error) {
    log.warn(`Session error, disconnecting`, error.stack);
    this.disconnect();
  }

  _onData(/* data */) {
    throw new Error(`Subclasses must override _onData`);
  }

  _onRssiUpdate(/* rssi */) {
    throw new Error(`Subclasses must override _onRssiUpdate`);
  }
}
