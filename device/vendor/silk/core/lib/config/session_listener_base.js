/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/* eslint-disable no-multi-spaces */

import createLog from 'silk-log/device';
import invariant from 'assert';
import * as Joi from 'joi';
import version from 'silk-core-version';

const log = createLog('config-session-listener-base');

export default class SessionListenerBase {

  _deviceConfig = null;
  _socketSession = null;
  _schema = null;
  _disconnecting = false;

  constructor(deviceConfig, socketSession, schema) {
    log.debug(`SessionListenerBase()`);

    invariant(deviceConfig);
    invariant(socketSession);
    invariant(schema);

    this._deviceConfig = deviceConfig;
    this._socketSession = socketSession;
    this._schema = schema;

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

  _validateData(data: any): ?Object {
    if (!data || (typeof data !== `object`)) {
      log.warn(`Data is not an object`, data);
      return null;
    }

    if (!(`name` in data)) {
      log.warn(`Data has no 'name' property`, data);
      return null;
    }

    const name = data.name;

    if (!(name in this._schema)) {
      log.warn(`Data has unexpected 'name' property`, data);
      return null;
    }

    log.debug(`Validating data: '${name}'`);

    let error;
    Joi.validate(data, this._schema[name], (err, value) => {
      if (err) {
        error = err;
      } else {
        data = value;
      }
    });

    if (error) {
      log.warn(`Data failed validation`, data, error);
      return null;
    }

    return data;
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
