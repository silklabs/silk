/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import {getstrprop} from 'silk-sysutils';
import * as Joi from 'joi';
import version from 'silk-core-version';

import type {ConnectedNetworkInfo, ScanResult} from 'silk-wifi';
import type {ConnectionType, DeviceConfig} from './index';
import type ParentSocketSession from '../btle/parent_socket_session';

export type ValidMessageData = {
  name: string;
  [key: string]: any;
}

const log = createLog(`config-session-listener-base`);

const DEVICE_TYPE =
  `${getstrprop('ro.silk.build.board')}-${getstrprop('ro.silk.build.product')}`;

export default class SessionListenerBase {

  _deviceConfig: DeviceConfig;
  _socketSession: ?ParentSocketSession;
  _schema: Object;
  _disconnecting: boolean = false;

  constructor(
    deviceConfig: DeviceConfig,
    socketSession: ParentSocketSession,
    schema: Object,
  ) {
    log.debug(`SessionListenerBase()`);

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
      model: DEVICE_TYPE,
      version: version.semver,
      image: new Uint8Array([ 0xfe, 0xfe, 0xfe, 0xfe ]),
    });
  }

  _validateData(data: any): ?ValidMessageData {
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

  sendStatus(type: ConnectionType, code: string): void {
    log.debug(`SessionListenerBase.sendStatus('${type}', '${code}')`);

    this._send({
      name: `status`,
      type,
      code,
    });
  }

  sendWifiScanResults(scanResults: Array<ScanResult>): void {
    log.debug(`SessionListenerBase.sendWifiScanResults()`);

    this._send({
      name: `wifiscan`,
      networks: scanResults,
    });
  }

  sendWifiConnectionInfo(info: ConnectedNetworkInfo) {
    log.debug(`SessionListenerBase.sendWifiConnectionInfo()`, info);

    this._send({
      name: `wifiinfo`,
      ...info,
    });
  }

  sendError(type: ConnectionType, code: string): void {
    log.debug(`SessionListenerBase.sendError('${type}', '${code}')`);

    this._send({
      name: `error`,
      type,
      code,
    });
  }

  disconnect(): void {
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

  _send(data: ValidMessageData): void {
    const socketSession = this._socketSession;
    if (!socketSession) {
      log.warn(`Unable to send because socketSession has already disconnected`,
               data);
      return;
    }

    log.debug(`SessionListenerBase._send()`, data);
    socketSession.write(data);
  }

  _onError(error: Error): void {
    log.warn(`Session error, disconnecting`, error);
    this.disconnect();
  }

  _onData(data: Object): void {
    throw new Error(`Subclasses must override _onData`);
  }

  _onRssiUpdate(rssi: number): void {
    throw new Error(`Subclasses must override _onRssiUpdate`);
  }
}
