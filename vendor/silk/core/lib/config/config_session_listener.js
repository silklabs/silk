/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import createLog from '../log';
import * as Joi from 'joi';
import SessionListenerBase from './session_listener_base';

const log = createLog('config-session-listener');

const SCHEMA = {
  decline: Joi.object().keys({
    name: Joi.string().equal(`decline`).required(),
  }).required(),

  accept: Joi.object().keys({
    name: Joi.string().equal(`accept`).required(),
  }).required(),

  restart: Joi.object().keys({
    name: Joi.string().equal(`restart`).required(),
  }).required(),

  secret: Joi.object().keys({
    name: Joi.string().equal(`secret`).required(),
    accessPoint: Joi.string().min(1).required(),
    password: Joi.string().allow(``).default(``).optional(),
    publicKey: Joi.string().lowercase().trim().length(66).hex().required(),
    regToken: Joi.string().required(),
  }).options({
    stripUnknown: true,
  }).required(),

  dismiss: Joi.object().keys({
    name: Joi.string().equal(`dismiss`).required(),
  }).required(),
};

export default class ConfigSessionListener extends SessionListenerBase {
  static STATE_IDLE = 0;
  static STATE_REGISTER_REQUESTED = 1;
  static STATE_REGISTERING = 2;
  static STATE_REGISTERING_PROXIMITY = 3;
  static STATE_REGISTERED = 5;
  static STATE_COMPLETE = 6;
  static STATE_DISMISSED = 7;

  static STATE_ERROR = 10;

  static DISMISS_TIMEOUT_MS = 15000;
  static MAX_WIFI_ERRORS = 3;

  _deviceConfig = null;
  _state = ConfigSessionListener.STATE_IDLE;
  _dismissTimeout = null;
  _wifiErrorCount = 0;

  constructor(deviceConfig) {
    log.debug(`ConfigSessionListener()`);

    super(deviceConfig);

    this._deviceConfig = deviceConfig;
  }

  _send(data) {
    assert(this._state !== ConfigSessionListener.STATE_ERROR);
    super._send(data);
  }

  _validateData(data) {
    log.debug(`ConfigSessionListener._validateData(%j)`, data);

    if (!(`name` in data)) {
      log.warn(`Data has no 'name' proptery`);
      return null;
    }

    if (!(data.name in SCHEMA)) {
      log.warn(`Data has unexpected 'name' property: '${data.name}'`);
      return null;
    }

    let error;
    Joi.validate(data, SCHEMA[data.name], (err, value) => {
      if (err) {
        error = err;
      } else {
        data = value;
      }
    });

    if (error) {
      log.warn(`Data failed validation`, error);
      return null;
    }

    return data;
  }

  _sendRegister() {
    assert(this._state === ConfigSessionListener.STATE_IDLE ||
           this._state === ConfigSessionListener.STATE_REGISTERING ||
           this._state === ConfigSessionListener.STATE_REGISTERING_PROXIMITY);

    this._send({
      name: `register`,
    });
    this._state = ConfigSessionListener.STATE_REGISTER_REQUESTED;
  }

  _completeRegistration(secret) {
    log.debug(`ConfigSessionListener._completeRegistration()`);

    assert(this._socketSession);
    assert(this._state === ConfigSessionListener.STATE_REGISTERING_PROXIMITY);

    this._state = ConfigSessionListener.STATE_REGISTERED;

    this._socketSession.rssiUpdatesEnabled = false;
    this.addStatusListeners();

    this._deviceConfig._onConfigured(secret);
  }

  _dismiss() {
    log.debug(`ConfigSessionListener._dismiss()`);

    assert(this._socketSession);
    assert(this._state === ConfigSessionListener.STATE_COMPLETE ||
           this._state === ConfigSessionListener.STATE_DISMISSED);

    if (this._state === ConfigSessionListener.STATE_DISMISSED) {
      return;
    }

    if (this._dismissTimeout) {
      clearTimeout(this._dismissTimeout);
      this._dismissTimeout = null;
    }

    this._state = ConfigSessionListener.STATE_DISMISSED;

    this._deviceConfig._onDismissed();
  }

  _onConnect(socketSession) {
    log.debug(`ConfigSessionListener._onConnect()`);
    assert(this._state === ConfigSessionListener.STATE_IDLE);

    super._onConnect(socketSession);

    this._sendRegister();
  }

  _onDisconnect(socketSession) {
    log.debug(`ConfigSessionListener._onDisconnect()`);

    super._onDisconnect(socketSession);

    // Reset.
    this._state = ConfigSessionListener.STATE_IDLE;
  }

  _onData(data) {
    log.debug(`ConfigSessionListener._onData()`);

    assert(this._state !== ConfigSessionListener.STATE_IDLE);

    data = this._validateData(data);
    if (!data) {
      this._state = ConfigSessionListener.STATE_ERROR;
      this.disconnect();
      return;
    }

    if (this._state === ConfigSessionListener.STATE_ERROR) {
      log.debug(`Received data while in the ERROR state, ignoring`);
      return;
    }

    switch (data.name) {
    case `decline`:
      if (this._state !== ConfigSessionListener.STATE_REGISTER_REQUESTED) {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
      }

      assert(!this._dismissTimeout);
      assert(!this._wifiErrorCount);

      log.info(`App declined to register this device, disconnecting`);
      break;

    case `accept`:
      if (this._state !== ConfigSessionListener.STATE_REGISTER_REQUESTED) {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      assert(!this._dismissTimeout);
      assert(!this._wifiErrorCount);

      log.info(`App agreed to register this device`);
      this._state = ConfigSessionListener.STATE_REGISTERING;
      this._socketSession.rssiUpdatesEnabled = true;
      return;

    case `restart`:
      if (this._state !== ConfigSessionListener.STATE_REGISTERING &&
          this._state !== ConfigSessionListener.STATE_REGISTERING_PROXIMITY) {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      assert(!this._dismissTimeout);
      assert(!this._wifiErrorCount);

      log.info(`App canceled registration of this device`);
      this._socketSession.rssiUpdatesEnabled = false;

      this._sendRegister();
      return;

    case `secret`:
      if (this._state !== ConfigSessionListener.STATE_REGISTERING_PROXIMITY) {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      assert(!this._dismissTimeout);
      assert(!this._wifiErrorCount);

      const secret = {
        accessPoint: data.accessPoint,
        password: data.password,
        publicKey: data.publicKey,
        regToken: data.regToken,
      };

      this._completeRegistration(secret);
      return;

    case `dismiss`:
      if (this._state !== ConfigSessionListener.STATE_COMPLETE &&
          this._state !== ConfigSessionListener.STATE_DISMISSED) {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      assert(!this._wifiErrorCount);

      this._dismiss();
      return;

    default:
      log.warn(`Unknown message: %j`, data);
    }

    this._socketSession.skip();
    this._state = ConfigSessionListener.STATE_ERROR;
    this.disconnect();
  }

  _onRssiUpdate(rssi) {
    log.debug(`ConfigSessionListener._onRssiUpdate(${rssi})`);

    if (this._state === ConfigSessionListener.STATE_ERROR) {
      log.debug(`Received rssi update while in the ERROR state, ignoring`);
      return;
    }

    assert(this._state >= ConfigSessionListener.STATE_REGISTERING);

    if (this._state === ConfigSessionListener.STATE_REGISTERING &&
        rssi >= -40) {
      log.info(`Passed proximity gate`);
      this._send({
        name: `secret`,
        deviceId: this._deviceConfig._deviceId,
      });
      this._state = ConfigSessionListener.STATE_REGISTERING_PROXIMITY;
    }

    this._send({
      name: `rssi`,
      rssi,
    });
  }

  _onWifiError(error) {
    log.debug(`ConfigSessionListener._onWifiError('${error.toString()}')`);

    super._onWifiError(error);

    if (this._state !== ConfigSessionListener.STATE_REGISTERED) {
      return;
    }

    this._wifiErrorCount++;

    if (this._wifiErrorCount === ConfigSessionListener.MAX_WIFI_ERRORS) {
      this.removeStatusListeners();

      const errorString = error.toString();
      const errorObject =
        new Error(`Wifi unable to connect after ${this._wifiErrorCount} ` +
                  `attempts: '${errorString}'`);
      const errorCode = SessionListenerBase.ERROR_CODE_MAP.get(errorString);
      assert(errorCode, `No error code for '${errorString}'`);
      this._sendError(errorCode);
      this._deviceConfig._stopRetryingWifiConnection(errorObject);
    }
  }

  _onDismissTimeout() {
    log.debug(`ConfigSessionListener._onDismissTimeout()`);

    assert(this._state === ConfigSessionListener.STATE_COMPLETE);

    this._dismissTimeout = null;

    this._dismiss();
  }

  disconnect() {
    log.debug(`ConfigSessionListener.disconnect()`);

    if (this._dismissTimeout) {
      clearTimeout(this._dismissTimeout);
      this._dismissTimeout = null;
    }

    super.disconnect();
  }

  sendComplete() {
    log.debug(`ConfigSessionListener.sendComplete()`);

    assert(this._state === ConfigSessionListener.STATE_REGISTERED);
    assert(!this._dismissTimeout);

    this._send({
      name: `complete`,
    });

    this._state = ConfigSessionListener.STATE_COMPLETE;
    this._wifiErrorCount = 0;

    this._dismissTimeout = setTimeout(() => this._onDismissTimeout,
                                      ConfigSessionListener.DISMISS_TIMEOUT_MS);
  }

  sendRestart(errorMessage) {
    log.debug(`ConfigSessionListener.sendRestart('${errorMessage}')`);

    assert(this._state === ConfigSessionListener.STATE_REGISTERED);
    assert(!this._dismissTimeout);

    this._send({
      name: `restart`,
    });

    this._wifiErrorCount = 0;
    this._state = ConfigSessionListener.STATE_REGISTERING_PROXIMITY;
  }
}
