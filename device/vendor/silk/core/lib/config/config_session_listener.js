/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import assert from 'assert';
import createLog from 'silk-log/device';
import * as Joi from 'joi';
import SessionListenerBase from './session_listener_base';
import {
  exec,
  getboolprop,
} from 'silk-sysutils';
import sensors from 'silk-sensors';

const log = createLog('config-session-listener');

const ACCELEROMETER_GATE_DISABLED =
  getboolprop('persist.silk.accelgate.disabled', true);

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
    password: Joi.string().allow(null).required(),
    publicKey: Joi.string().lowercase().trim().length(64).hex().required(),
    regToken: Joi.string().required(),
    serverUrl: Joi.string().allow(``).default(``).optional(),
    time: Joi.number().required(),
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
  static RSSI_THRESHOLD = -60;

  // Minimum acceleration for "device motion" threshold (units are m/s^2).
  // This threshold was obtained by nudging a device IRL and may need to be
  // tuned and/or made device specific.
  static MOTION_THRESHOLD = 0.03;

  _state = ConfigSessionListener.STATE_IDLE;
  _dismissTimeout = null;
  _wifiErrorCount = 0;

  constructor(deviceConfig, socketSession) {
    log.debug(`ConfigSessionListener()`);

    // We're attempting to configure this device so we can't use authenticated
    // streams yet.
    socketSession.allowUnauthenticated(true);

    super(deviceConfig, socketSession, SCHEMA);

    // Tell the app that we need to be configured.
    this._sendRegister();
  }

  sendStatus(status) {
    if (this._state !== ConfigSessionListener.STATE_REGISTERED) {
      return;
    }
    super.sendStatus(status);
  }

  _clearDismissTimeout() {
    if (this._dismissTimeout) {
      clearTimeout(this._dismissTimeout);
      this._dismissTimeout = null;
    }
  }

  _send(data) {
    assert(this._state !== ConfigSessionListener.STATE_ERROR);
    super._send(data);
  }

  _sendRegister() {
    log.debug(`ConfigSessionListener._sendRegister()`);

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

    this._deviceConfig._onConfigured(secret);
  }

  _dismiss() {
    log.debug(`ConfigSessionListener._dismiss()`);

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

  _onError(error) {
    log.debug(`ConfigSessionListener._onError('${error.toString()}')`);

    super._onError(error);

    this._clearDismissTimeout();

    // Set the STATE_ERROR state so that we ignore any further data.
    this._state = ConfigSessionListener.STATE_ERROR;

    this._deviceConfig.stopRetryingWifiConnection(error);
    sensors.removeListener('data', this._onAccelerometer);
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

      this._deviceConfig._beginConfigure(this);

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
      sensors.removeListener('data', this._onAccelerometer);

      this._deviceConfig._cancelConfigure();
      this._sendRegister();
      return;

    case `secret`:
      {
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
          serverUrl: data.serverUrl,
        };

        const time = new Date(data.time);
        log.debug(`Setting system time to configuring app's time`, time);

        exec('time_genoff', [time.getTime().toString()])
          .catch((error) => log.warn(`Unable to set system time`, error))
          .then(() => this._completeRegistration(secret));
      }
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
      log.warn(`Unknown message`, data);
    }

    this._state = ConfigSessionListener.STATE_ERROR;
    this.disconnect();
  }

  _onRssiUpdate(rssi) {
    log.debug(`ConfigSessionListener._onRssiUpdate(${rssi})`);

    if (this._state === ConfigSessionListener.STATE_ERROR) {
      log.debug(`Received rssi update while in the ERROR state, ignoring`);
      return;
    }

    assert(this._state === ConfigSessionListener.STATE_REGISTERING);

    if (rssi < ConfigSessionListener.RSSI_THRESHOLD) {
      return;
    }

    log.info(`Passed proximity gate`);
    this._socketSession.rssiUpdatesEnabled = false;

    if (ACCELEROMETER_GATE_DISABLED) {
      this._registeredProximity();
      return;
    }
    this.lastx = this.lasty = this.lastz = NaN;
    sensors.on('data', this._onAccelerometer);
  }

  _onAccelerometer = (sensorEvent) => {
    if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.ACCELEROMETER) {
      return;
    }
    let [x, y, z] = sensorEvent.values;
    const motion = Math.abs(x - this.lastx) +
                   Math.abs(y - this.lasty) +
                   Math.abs(z - this.lastz);
    this.lastx = x;
    this.lasty = y;
    this.lastz = z;

    log.debug(`Current motion is ~${motion} m/s^2`);
    if (motion > ConfigSessionListener.MOTION_THRESHOLD) {
      log.info(`Passed motion gate.  Device moved ~${motion} m/s^2`);
      sensors.removeListener('data', this._onAccelerometer);
      this._registeredProximity();
    }
  };

  _registeredProximity() {
    this._state = ConfigSessionListener.STATE_REGISTERING_PROXIMITY;

    this._send({
      name: `secret`,
      deviceId: this._deviceConfig._deviceId,
    });
  }

  _onDismissTimeout() {
    log.debug(`ConfigSessionListener._onDismissTimeout()`);

    assert(this._state === ConfigSessionListener.STATE_COMPLETE);

    this._dismissTimeout = null;

    this._dismiss();
  }

  disconnect() {
    log.debug(`ConfigSessionListener.disconnect()`);

    if (this._disconnecting) {
      return;
    }

    // Set the STATE_ERROR state so that we ignore any further data.
    this._state = ConfigSessionListener.STATE_ERROR;

    this._deviceConfig.stopRetryingWifiConnection(new Error(`Disconnecting`));
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

  maybeSendRestart(errorMessage) {
    log.debug(`ConfigSessionListener.maybeSendRestart('${errorMessage}')`);

    assert(this._state === ConfigSessionListener.STATE_IDLE ||
           this._state === ConfigSessionListener.STATE_REGISTERED);
    assert(!this._dismissTimeout);

    if (this._state === ConfigSessionListener.STATE_IDLE) {
      log.info(`No longer connected, cannot restart`);
      return;
    }

    this._send({
      name: `restart`,
    });

    this._wifiErrorCount = 0;
    this._state = ConfigSessionListener.STATE_REGISTERING_PROXIMITY;
  }

  onWifiError(errorCode) {
    log.debug(`ConfigSessionListener.onWifiError('${errorCode}')`);

    if (this._state !== ConfigSessionListener.STATE_REGISTERED) {
      return;
    }

    this._wifiErrorCount++;

    if (this._wifiErrorCount === ConfigSessionListener.MAX_WIFI_ERRORS) {
      this.sendError(errorCode);

      const error =
        new Error(`Wifi unable to connect after ${this._wifiErrorCount} ` +
                  `attempts: '${errorCode}'`);
      this._deviceConfig.stopRetryingWifiConnection(error);
    }
  }
}
