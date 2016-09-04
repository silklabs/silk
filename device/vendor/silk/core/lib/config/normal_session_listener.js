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

import {
  default as SessionListenerBase,
  RSSI_THRESHOLD,
} from './session_listener_base';
import getStore from '../store';

import type {DeviceConfig} from './index';
import type {ValidMessageData} from './session_listener_base';
import type ParentSocketSession from '../btle/parent_socket_session';

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

const UNPAIRED_WHITELIST = new Set([
  'unauthorized',
]);

export default class NormalSessionListener extends SessionListenerBase {

  _error: boolean = false;
  _allowed: boolean = false;
  _pairedQueue: Array<ValidMessageData> = [];
  _accountDeviceNumber: number;

  constructor(deviceConfig: DeviceConfig, socketSession: ParentSocketSession) {
    log.debug(`NormalSessionListener()`);

    super(deviceConfig, socketSession, SCHEMA);

    socketSession.once(`unauthenticated`, this._onUnauthenticated);
    socketSession.once(`authenticated`, this._onAuthenticated);
    socketSession.once(`paired`, this._onPaired);

    const {config} = getStore().getState().persist;
    invariant(config);
    invariant(config.accountDeviceNumber);

    const deviceId = this._deviceConfig._deviceId;
    invariant(deviceId);

    this._accountDeviceNumber = config.accountDeviceNumber;

    this._sendId();

    this._send({
      name: `registered`,
      deviceId,
      accountDeviceNumber: config.accountDeviceNumber,
    });
  }

  _send(data: ValidMessageData): void {
    const socketSession = this._socketSession;
    if (!socketSession ||
        socketSession.paired ||
        UNPAIRED_WHITELIST.has(data.name)) {
      super._send(data);
      return;
    }

    log.debug(`Queuing '${data.name}' message until paired`);
    this._pairedQueue.push(data);
  }

  _onUnauthenticated: (() => void) = () => {
    log.warn(`Unauthenticated data is not allowed`);
    invariant(this._socketSession);
    this._error = true;
    this._socketSession.allow(false);
    this.disconnect();
  };

  _onAuthenticated: (() => void) = () => {
    invariant(!this._allowed);

    const socketSession = this._socketSession;
    invariant(socketSession);

    const {publicKey, status} = socketSession;
    invariant(publicKey);
    invariant(status === `authenticated`);

    this._allowed = true;

    log.info(`Allowing ${status} connection to ${publicKey}`);
    socketSession.allow(true);

    this._send({
      name: `unauthorized`,
      accountDeviceNumber: this._accountDeviceNumber,
    });

    socketSession.rssiUpdatesEnabled = true;
  };

  _onPaired: (() => void) = () => {
    const socketSession = this._socketSession;
    invariant(socketSession);

    const {publicKey, status} = socketSession;
    invariant(publicKey);
    invariant(status === `paired`);

    if (this._allowed) {
      log.info(`Connection to ${publicKey} is now ${status}`);
      this._deviceConfig._addPairedKey(publicKey);
    } else {
      this._allowed = true;

      log.info(`Allowing ${status} connection to ${publicKey}`);
      socketSession.allow(true);
    }

    if (this._pairedQueue.length) {
      log.debug(`Sending queued messages`);

      const messages = this._pairedQueue;
      this._pairedQueue = [];

      for (let message of messages) {
        this._send(message);
      }
    }
  };

  _ensurePaired(): boolean {
    invariant(this._socketSession);
    if (!this._socketSession.paired) {
      log.warn(`This connection is not paired`);
      this._error = true;
      this.disconnect();
      return false;
    }
    return true;
  }

  _onData(unvalidatedData: Object): void {
    log.debug(`ConfigSessionListener._onData()`);

    invariant(this._socketSession);

    if (!this._socketSession.authenticated) {
      log.warn(`This connection is unauthenticated`);
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
      if (!this._ensurePaired()) {
        return;
      }
      this._deviceConfig.scanWifi();
      return;
    }

    case `wifiSelect`: {
      if (!this._ensurePaired()) {
        return;
      }
      this._deviceConfig.connectToWifi(data.accessPoint, data.password);
      return;
    }

    case `wifiInfo`: {
      if (!this._ensurePaired()) {
        return;
      }
      this._deviceConfig.getWifiConnectionInfo(this);
      return;
    }

    default:
      log.warn(`Unknown message`, data);
      this._error = true;
      this.disconnect();
    }
  }

  _onRssiUpdate(rssi: number): void {
    log.debug(`NormalSessionListener._onRssiUpdate(${rssi})`);

    if (this._error) {
      log.debug(`Received rssi update while in the ERROR state, ignoring`);
      return;
    }

    const socketSession = this._socketSession;
    if (!socketSession) {
      return;
    }

    const {authenticated, paired, publicKey} = socketSession;
    invariant(authenticated);
    invariant(publicKey);
    invariant(!paired);

    if (rssi < RSSI_THRESHOLD) {
      return;
    }

    log.info(`Passed proximity gate`);

    socketSession.rssiUpdatesEnabled = false;
    socketSession.setPaired(publicKey);
  }
}
