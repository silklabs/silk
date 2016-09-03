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
import sensors from 'silk-sensors';
import {
  exec,
  getboolprop,
  setprop,
} from 'silk-sysutils';

import {
  default as SessionListenerBase,
  RSSI_THRESHOLD,
} from './session_listener_base';

import type {
  ConnectionType,
  DeviceConfig,
  Secret,
} from './index';
import type ParentSocketSession from '../btle/parent_socket_session';
import type {ValidMessageData} from './session_listener_base';

type State =
  'idle' |
  'register_requested' |
  'registering' |
  'registering_proximity' |
  'registered' |
  'complete' |
  'dismissed' |
  'error';

const DISMISS_TIMEOUT_MS = 15000;
const MAX_WIFI_ERRORS = 3;

// Minimum acceleration for "device motion" threshold (units are m/s^2).
// This threshold was obtained by nudging a device IRL and may need to be
// tuned and/or made device specific.
const MOTION_THRESHOLD = 0.03;

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
    timezoneOffset: Joi.number().required(),
  }).options({
    stripUnknown: true,
  }).required(),

  wifiInfo: Joi.object().keys({
    name: Joi.string().equal(`wifiInfo`).required(),
  }).required(),

  dismiss: Joi.object().keys({
    name: Joi.string().equal(`dismiss`).required(),
  }).required(),
};

const log = createLog('config-session-listener');

export default class ConfigSessionListener extends SessionListenerBase {

  _state: State = 'idle';
  _dismissTimeout: ?number = null;
  _wifiErrorCount: number = 0;

  // Accelerometer data.
  _lastx: number = NaN;
  _lasty: number = NaN;
  _lastz: number = NaN;

  constructor(deviceConfig: DeviceConfig, socketSession: ParentSocketSession) {
    log.debug(`ConfigSessionListener()`);

    socketSession.once(`unauthenticated`, () => {
      // We're attempting to configure this device so we can't use authenticated
      // streams yet.
      socketSession.allow(true);
    });

    super(deviceConfig, socketSession, SCHEMA);

    this._sendId();

    // Tell the app that we need to be configured.
    this._sendRegister();
  }

  sendStatus(type: ConnectionType, code: string): void {
    if (this._state !== 'registered' && this._state !== 'complete') {
      return;
    }
    super.sendStatus(type, code);
  }

  _clearDismissTimeout(): void {
    if (this._dismissTimeout) {
      clearTimeout(this._dismissTimeout);
      this._dismissTimeout = null;
    }
  }

  _send(data: ValidMessageData): void {
    invariant(this._state !== 'error');
    super._send(data);
  }

  _sendRegister(): void {
    log.debug(`ConfigSessionListener._sendRegister()`);

    invariant(this._state === 'idle' ||
              this._state === 'registering' ||
              this._state === 'registering_proximity');

    this._send({
      name: `register`,
    });
    this._state = 'register_requested';
  }

  _completeRegistration(secret: Secret) {
    log.debug(`ConfigSessionListener._completeRegistration()`);

    invariant(this._socketSession);
    invariant(this._state === 'registering_proximity');

    this._state = 'registered';

    this._deviceConfig._onConfigured(secret);
  }

  _dismiss(): void {
    log.debug(`ConfigSessionListener._dismiss()`);

    invariant(this._state === 'complete' ||
              this._state === 'dismissed');

    if (this._state === 'dismissed') {
      return;
    }

    if (this._dismissTimeout) {
      clearTimeout(this._dismissTimeout);
      this._dismissTimeout = null;
    }

    this._state = 'dismissed';

    this._deviceConfig._onDismissed();
  }

  _onError(error: Error): void {
    log.debug(`ConfigSessionListener._onError('${error.toString()}')`);

    super._onError(error);

    this._clearDismissTimeout();

    // Set the 'error' state so that we ignore any further data.
    this._state = 'error';

    this._deviceConfig.stopRetryingWifiConnection(error);
    sensors.removeListener('data', this._onAccelerometer);
  }

  _onData(unvalidatedData: Object): void {
    log.debug(`ConfigSessionListener._onData()`);

    invariant(this._state !== 'idle');

    const data = this._validateData(unvalidatedData);
    if (!data) {
      this._state = 'error';
      this.disconnect();
      return;
    }

    if (this._state === 'error') {
      log.debug(`Received data while in the ERROR state, ignoring`);
      return;
    }

    const socketSession = this._socketSession;
    invariant(socketSession);

    switch (data.name) {
    case `decline`:
      if (this._state !== 'register_requested') {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
      }

      invariant(!this._dismissTimeout);
      invariant(!this._wifiErrorCount);

      log.info(`App declined to register this device, disconnecting`);
      break;

    case `accept`:
      if (this._state !== 'register_requested') {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      invariant(!this._dismissTimeout);
      invariant(!this._wifiErrorCount);

      log.info(`App agreed to register this device`);

      this._deviceConfig._beginConfigure(this);

      this._state = 'registering';
      socketSession.rssiUpdatesEnabled = true;
      return;

    case `restart`:
      if (this._state !== 'registering' &&
          this._state !== 'registering_proximity') {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      invariant(!this._dismissTimeout);
      invariant(!this._wifiErrorCount);

      log.info(`App canceled registration of this device`);
      socketSession.rssiUpdatesEnabled = false;
      sensors.removeListener('data', this._onAccelerometer);

      this._deviceConfig._cancelConfigure();
      this._sendRegister();
      return;

    case `secret`:
      {
        if (this._state !== 'registering_proximity') {
          log.warn(`Received '${data.name}' while in state ${this._state}`);
          break;
        }

        invariant(!this._dismissTimeout);
        invariant(!this._wifiErrorCount);

        const secret: Secret = {
          accessPoint: data.accessPoint,
          password: data.password,
          publicKey: data.publicKey,
          regToken: data.regToken,
          serverUrl: data.serverUrl,
        };

        invariant(this._socketSession);
        this._socketSession.setPaired(data.publicKey);

        const time = new Date(data.time);
        log.verbose(`Setting time to`, time);

        exec('time_genoff', [time.getTime().toString()])
          .catch((error) => log.warn(`Unable to set system time`, error))
          .then(() => this._completeRegistration(secret));

        const timezoneOffset = data.timezoneOffset;
        const hourOffset = Math.abs(timezoneOffset) / 60;
        const minuteOffset = Math.abs(timezoneOffset) % 60;
        const timezone = 'UTC' +
          (timezoneOffset < 0 ? '-' : '+') +
          ('00' + hourOffset.toString()).substr(-2) +
          ':' +
          ('00' + minuteOffset.toString()).substr(-2);
        log.verbose(`Setting timezone to`, timezone);
        setprop('persist.sys.timezone', timezone);
      }
      return;

    case `wifiInfo`:
      if (this._state !== 'complete') {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      invariant(this._socketSession);
      invariant(this._socketSession.paired);

      this._deviceConfig.getWifiConnectionInfo(this);
      return;


    case `dismiss`:
      if (this._state !== 'complete' && this._state !== 'dismissed') {
        log.warn(`Received '${data.name}' while in state ${this._state}`);
        break;
      }

      invariant(!this._wifiErrorCount);

      this._dismiss();
      return;

    default:
      log.warn(`Unknown message`, data);
    }

    this._state = 'error';
    this.disconnect();
  }

  _onRssiUpdate(rssi: number): void {
    log.debug(`ConfigSessionListener._onRssiUpdate(${rssi})`);

    if (this._state === 'error') {
      log.debug(`Received rssi update while in the ERROR state, ignoring`);
      return;
    }

    invariant(this._state === 'registering');

    if (rssi < RSSI_THRESHOLD) {
      return;
    }

    log.info(`Passed proximity gate`);

    invariant(this._socketSession);
    this._socketSession.rssiUpdatesEnabled = false;

    if (ACCELEROMETER_GATE_DISABLED) {
      this._registeredProximity();
      return;
    }

    this._lastx = this._lasty = this._lastz = NaN;
    sensors.addListener('data', this._onAccelerometer);
  }

  // TODO: Better Flow.
  _onAccelerometer: ((sensorEvent: Object) => void) = (sensorEvent) => {
    if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.ACCELEROMETER) {
      return;
    }
    const [x, y, z] = sensorEvent.values;
    const motion = Math.abs(x - this._lastx) +
                   Math.abs(y - this._lasty) +
                   Math.abs(z - this._lastz);
    this._lastx = x;
    this._lasty = y;
    this._lastz = z;

    if (motion < MOTION_THRESHOLD) {
      log.debug(`Current motion is ~${motion} m/s^2`);
      return;
    }

    log.info(`Passed motion gate.  Device moved ~${motion} m/s^2`);
    sensors.removeListener('data', this._onAccelerometer);

    this._registeredProximity();
  };

  _registeredProximity(): void {
    this._state = 'registering_proximity';

    this._send({
      name: `secret`,
      deviceId: this._deviceConfig._deviceId,
    });
  }

  _onDismissTimeout(): void {
    log.debug(`ConfigSessionListener._onDismissTimeout()`);

    invariant(this._state === 'complete');

    this._dismissTimeout = null;

    this._dismiss();
  }

  disconnect(): void {
    log.debug(`ConfigSessionListener.disconnect()`);

    if (this._disconnecting) {
      return;
    }

    const currentState = this._state;

    // Set the 'error' state so that we ignore any further data.
    this._state = 'error';

    // We don't need to cancel wifi connection if we're past 'complete'.
    if (currentState !== 'complete' && currentState !== 'dismissed') {
      this._deviceConfig.stopRetryingWifiConnection(new Error(`Disconnecting`));
      this._deviceConfig._cancelConfigure();
    }

    super.disconnect();
  }

  sendComplete(accountDeviceNumber: number): void {
    log.debug(`ConfigSessionListener.sendComplete(${accountDeviceNumber})`);

    invariant(this._state === 'registered');
    invariant(!this._dismissTimeout);

    this._send({
      name: `complete`,
      accountDeviceNumber,
    });

    this._state = 'complete';
    this._wifiErrorCount = 0;

    this._dismissTimeout = setTimeout(() => this._onDismissTimeout,
                                      DISMISS_TIMEOUT_MS);
  }

  maybeSendRestart(errorMessage: string): void {
    log.debug(`ConfigSessionListener.maybeSendRestart('${errorMessage}')`);

    invariant(this._state === 'idle' || this._state === 'registered');
    invariant(!this._dismissTimeout);

    if (this._state === 'idle') {
      log.info(`No longer connected, cannot restart`);
      return;
    }

    this._send({
      name: `restart`,
    });

    this._wifiErrorCount = 0;
    this._state = 'registering_proximity';
  }

  onWifiError(errorCode: string): void {
    log.debug(`ConfigSessionListener.onWifiError('${errorCode}')`);

    if (this._state !== 'registered') {
      return;
    }

    this._wifiErrorCount++;

    if (this._wifiErrorCount === MAX_WIFI_ERRORS) {
      this.sendError('wifi', errorCode);

      const error =
        new Error(`Wifi unable to connect after ${this._wifiErrorCount} ` +
                  `attempts: '${errorCode}'`);
      this._deviceConfig.stopRetryingWifiConnection(error);
    }
  }
}
