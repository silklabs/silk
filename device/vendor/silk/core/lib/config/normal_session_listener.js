/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import invariant from 'assert';
import * as Joi from 'joi';

import SessionListenerBase from './session_listener_base';

import type {DeviceConfig} from './index';
import type ParentSocketSession from '../btle/parent_socket_session';
import getStore from '../store';

const log = createLog('normal-session-listener');

const SCHEMA = {
  wifiScan: Joi.object().keys({
    name: Joi.string().equal(`wifiScan`).required(),
  }).required(),

  wifiSelect: Joi.object().keys({
    name: Joi.string().equal(`wifiSelect`).required(),
    accessPoint: Joi.string().min(1).required(),
    password: Joi.string().allow(null).required(),
  }).required(),

  wifiInfo: Joi.object().keys({
    name: Joi.string().equal(`wifiInfo`).required(),
  }).required(),
};

export default class NormalSessionListener extends SessionListenerBase {

  _error: boolean = false;

  constructor(deviceConfig: DeviceConfig, socketSession: ParentSocketSession) {
    log.debug(`NormalSessionListener()`);

    // We're already configured so we require authenticated streams.
    socketSession.once(`unauthenticated`, () => {
      socketSession.allowUnauthenticated(false);
    });

    super(deviceConfig, socketSession, SCHEMA);

    const {config} = getStore().getState().persist;
    invariant(config);
    invariant(config.accountDeviceNumber);

    this._send({
      name: `registered`,
      deviceId: this._deviceConfig._deviceId,
      accountDeviceNumber: config.accountDeviceNumber,
    });
  }

  _onData(unvalidatedData: Object): void {
    log.debug(`ConfigSessionListener._onData()`);

    invariant(this._socketSession);

    if (!this._socketSession.authenticated) {
      log.warn(`Receiving data from an unauthenticated source`);
      this._error = true;
      this.disconnect();
      return;
    }

    const data = this._validateData(unvalidatedData);
    if (!data) {
      this._error = true;
      this.disconnect();
      return;
    }

    if (this._error) {
      log.debug(`Received data after an error, ignoring`);
      return;
    }

    switch (data.name) {
    case `wifiScan`: {
      this._deviceConfig.scanWifi();
      break;
    }

    case `wifiSelect`: {
      this._deviceConfig.connectToWifi(data.accessPoint, data.password);
      break;
    }

    case `wifiInfo`: {
      this._deviceConfig.getWifiConnectionInfo(this);
      break;
    }

    default:
      log.warn(`Unknown message`, data);
      this._error = true;
      this.disconnect();
    }
  }

  _onRssiUpdate(rssi: number): void {
    log.warn(`Unexpected rssi update, disconnecting`);

    this._error = true;
    this.disconnect();
  }
}
