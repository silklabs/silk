/**
 * @flow
 */

import invariant from 'assert';
import * as Joi from 'joi';
import {Systrace} from 'react-native';
import mklog from 'silk-log';
import RobustEventEmitter from 'silk-utils/robust_event_emitter';

import * as Metrics from './metrics';
import SocketSession from './socket_session';

// eslint-disable-next-line no-unused-vars
import type {MetricsAgent, SilkApi} from 'silk-api';
import type {Socket} from 'silk-ble-socket';
import type {StatusEvent as UpdateStatusEvent} from 'silk-update';

export type DeviceStatus = {
  message: string;
  isError: boolean;
};

export type DeviceWifiInfo = {
  ssid: string;
  level: number;
};

export type DeviceWifiNetwork = DeviceWifiInfo & {
  psk: boolean;
};

type MessageData = {
  name: string;
  // TODO: even better: do union `name`:
  // type MessageData = {...} | {...} | {...};
  [arbitraryKey: string]: any;
};

export type WifiConfiguration = {
  accessPoint: string;
  password: string;
};

export type RegistrationInformation = WifiConfiguration & {
  publicKey: string;
  regToken: string;
  serverUrl: ?string;
  time: number;
  timezoneOffset: number;
};

export type DeviceSecret = {
  deviceId: string;
};

const log = mklog('btle-DeviceSession');

const ACCOUNT_DEVICE_NUMBER_SCHEMA =
  Joi.number().integer().min(1).required();

const SCHEMA = {
  unauthorized: Joi.object().keys({
    name: Joi.string().equal(`unauthorized`).required(),
    accountDeviceNumber: ACCOUNT_DEVICE_NUMBER_SCHEMA,
  }),

  id: Joi.object().keys({
    name: Joi.string().equal(`id`).required(),
    manufacturer: Joi.string().required(),
    model: Joi.string().required(),
    version: Joi.string().required(),
    // TODO: this should really be
    // Joi.object().type(Uint8Array).optional()
    // but that doesn't work due to the Uint8Array polyfill.
    // See https://github.com/silklabs/silk-app/issues/597.
    image: Joi.object().optional(),
  }).required(),

  registered: Joi.object().keys({
    name: Joi.string().equal(`registered`).required(),
    deviceId: Joi.string().lowercase().trim().length(64).hex().required(),
    accountDeviceNumber: ACCOUNT_DEVICE_NUMBER_SCHEMA,
  }).required(),

  status: Joi.object().keys({
    name: Joi.string().equal(`status`).required(),
    type: Joi.string().only([`wifi`, `server`]).required(),
    code: Joi.string().required(),
  }).required(),

  wifiscan: Joi.object().keys({
    name: Joi.string().equal(`wifiscan`).required(),
    networks: Joi.array().items(
      Joi.object().keys({
        ssid: Joi.string().required(),
        level: Joi.number().integer().min(-100).max(-10).required(),
        psk: Joi.boolean().required(),
      }),
    ).required(),
  }).required(),

  wifiinfo: Joi.object().keys({
    name: Joi.string().equal(`wifiinfo`).required(),
    ssid: Joi.string().required(),
    level: Joi.number().integer().min(-100).max(-10).required(),
  }).required(),

  error: Joi.object().keys({
    name: Joi.string().equal(`error`).required(),
    type: Joi.string().only([`wifi`, `server`]).required(),
    code: Joi.string().required(),
  }).required(),

  update: Joi.object().keys({
    name: Joi.string().equal(`update`).required(),
    state: Joi.string().only([
      `disabled`,
      `idle`,
      `checking`,
      `downloading`,
      `staging`,
      `staged`,
      `applying`,
    ]).required(),
    timestamp: Joi.number().integer().positive().required(),
    progress: Joi.object().keys({
      totalBytes: Joi.number().integer().min(0).required(),
      receivedBytes: Joi.number().integer().min(0).required(),
      remainingBytes: Joi.number().integer().min(0).required(),
      elapsedSec: Joi.number().integer().min(0).required(),
      remainingSec: Joi.number().integer().min(0).required(),
      receivedBytesPerSec: Joi.number().min(0).required(),
      percentageComplete: Joi.number().min(0).required(),
    }).optional(),
    error: Joi.string().optional(),
  }).required(),

  register: Joi.object().keys({
    name: Joi.string().equal(`register`).required(),
  }).required(),

  secret: Joi.object().keys({
    name: Joi.string().equal(`secret`).required(),
    deviceId: Joi.string().lowercase().trim().length(64).hex().required(),
  }).required(),

  restart: Joi.object().keys({
    name: Joi.string().equal(`restart`).required(),
  }).required(),

  complete: Joi.object().keys({
    name: Joi.string().equal(`complete`).required(),
    accountDeviceNumber: ACCOUNT_DEVICE_NUMBER_SCHEMA,
  }).required(),
};

export default class DeviceSession extends RobustEventEmitter {
  static STATE_UNKNOWN = 0;
  static STATE_ID_RECEIVED = 1;
  static STATE_REGISTER_REQUESTED = 2;
  static STATE_REGISTERING = 3;
  static STATE_REGISTERING_PROXIMITY = 4;
  static STATE_REGISTERING_SENT_SECRET = 5;
  static STATE_REGISTERED = 6;
  static STATE_DISMISSED = 7;
  static STATE_RESTARTED = 8;
  static STATE_UNAUTHORIZED = 9;

  static STATE_ERROR = 10;

  static RSSI_THRESHOLD = -60;

  _id: number;
  _socketSession: SocketSession;

  _state: number = DeviceSession.STATE_UNKNOWN; // TODO number -> string enum
  _secret: ?DeviceSecret = null;
  _error: ?Error = null;

  _manufacturer: string = ``;
  _model: string = ``;
  _version: string = ``;
  _image: ?Buffer = null;

  _isRegistered: boolean = false;
  _deviceId: ?string = null;
  _accountDeviceNumber: ?number = null;
  _wifiStatus: ?DeviceStatus = null;
  _serverStatus: ?DeviceStatus = null;
  _wifiNetworks: ?Array<DeviceWifiNetwork> = null;
  _wifiInfo: ?DeviceWifiInfo = null;
  _updateStatusEvent: ?UpdateStatusEvent = null;

  _connectEmitted: boolean = false;
  _registeredEmitted: boolean = false;
  _secretEmitted: boolean = false;
  _acceptRegistrationPending: boolean = false;

  _metrics: MetricsAgent;
  _forceDisconnectReported: boolean = false;

  constructor(
    socket: Socket,
    api: SilkApi,
    registeredDevicesPublicKeys: Array<string>
  ) {
    log.debug(`DeviceSession()`);
    super();

    this._id = socket.id;
    socket.addListener(`disconnect`, this._onDisconnect);

    const {accessToken, metrics} = api;
    invariant(socket);
    invariant(accessToken);
    invariant(accessToken.priv);
    invariant(registeredDevicesPublicKeys);

    const socketSession = new SocketSession(
      socket,
      accessToken,
      registeredDevicesPublicKeys,
      /* unpairedPublicKeys */ [],
      metrics
    );
    socketSession.addListener(`error`, this._onError);
    socketSession.addListener(`data`, this._onData);
    socketSession.addListener(`rssiUpdate`, this._onRssiUpdate);
    socketSession.addListener(`end`, this._onEnd);
    this._socketSession = socketSession;

    this._metrics = metrics;
  }

  _onDisconnect: (() => void) = () => {
    this.emit(`disconnect`, this);
  };

  _validateData(data: MessageData): ?Error {
    log.debug(`DeviceSession._validateData()`, data.name);

    if (!data || (typeof data !== `object`)) {
      return new Error(`Data must be an object`);
    }

    if (!(`name` in data)) {
      return new Error(`Data has no 'name' property`);
    }

    if (!(data.name in SCHEMA)) {
      return new Error(`Data has unexpected 'name' property: '${data.name}'`);
    }

    let error = null;
    Joi.validate(data, SCHEMA[data.name], (err, val) => {
      error = err;
    });
    return error;
  }

  _forceDisconnect() {
    log.debug(`DeviceSession._forceDisconnect()`);

    this._state = DeviceSession.STATE_ERROR;
    this._socketSession.rssiUpdatesEnabled = false;
    this._socketSession.disconnect();

    if (!this._forceDisconnectReported) {
      this._forceDisconnectReported = true;
      this._metrics.add(new Metrics.ForceDisconnect());
    }
  }

  _emitError: ((error: Error) => void) = (error) => {
    if (this._error) {
      log.warn(`Multiple session errors`, error);
      return;
    }

    log.warn(`Session error, disconnecting`, error);
    this._error = error;
    this.emit(`error`, error);
    this._forceDisconnect();
  };

  _emitConnect() {
    log.debug(`DeviceSession._emitConnect()`);

    invariant(this._state === DeviceSession.STATE_UNAUTHORIZED ||
              this._state === DeviceSession.STATE_REGISTER_REQUESTED ||
              this._state === DeviceSession.STATE_REGISTERED);
    invariant(!this._connectEmitted);
    this._connectEmitted = true;

    this.emit(`connect`, this);
  }

  _emitRegistered() {
    log.debug(`DeviceSession._emitRegistered()`);

    invariant(this._state === DeviceSession.STATE_REGISTERED);
    invariant(!this._registeredEmitted);
    this._registeredEmitted = true;

    this.emit(`registered`);
  }

  _maybeEmitSecret() {
    log.debug(`DeviceSession._maybeEmitSecret()`);

    invariant(this._state === DeviceSession.STATE_REGISTERING ||
              this._state === DeviceSession.STATE_REGISTERING_PROXIMITY);
    invariant(!this._secretEmitted);

    if (this._state === DeviceSession.STATE_REGISTERING_PROXIMITY &&
        this._secret) {
      this._secretEmitted = true;
      this.emit(`secret`, this._secret);
    }
  }

  _onError: ((error: Error) => void) = (error) => {
    this._emitError(error);
  };

  _onEnd: (() => void) = () => {
    log.debug(`DeviceSession._onEnd()`);

    if (this._state !== DeviceSession.STATE_DISMISSED) {
      const error = new Error(`Device session ended before dismissed`);
      this._emitError(error);
    }
  };

  _onData: ((data: MessageData) => void) = (data) => {
    if (__DEV__) {
      Systrace.beginEvent(`ble.DeviceSession._onData('${data.name}')`);
    }
    this._onDataImpl(data);
    if (__DEV__) {
      Systrace.endEvent();
    }
  };

  _onDataImpl(data: MessageData) {
    log.debug(`DeviceSession._onData()`, data.name);

    const validationError = this._validateData(data);
    if (validationError) {
      log.warn(`Data validation failed`, validationError);
      this._emitError(validationError);
      return;
    }

    const state = this._state;
    if (state === DeviceSession.STATE_DISMISSED) {
      log.debug(`Session already dismissed, dropping incoming '${data.name}' message.`);
      return;
    }

    if (state === DeviceSession.STATE_ERROR) {
      log.debug(`Received data while in the ERROR state, ignoring`);
      return;
    }

    if (state === DeviceSession.STATE_RESTARTED &&
        data.name !== `register`) {
      // We've requested to restart the configuration process. While
      // we're waiting for the device acknowledge with `register` (which
      // resets state back to STATE_REGISTER_REQUESTED), ignore any other
      // messages that the device might still be sending to us.
      return;
    }

    switch (data.name) {
    case `unauthorized`: {
      if (state !== DeviceSession.STATE_UNKNOWN) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      log.info(`Not authorized to connect to registered device ` +
               data.accountDeviceNumber);
      this._state = DeviceSession.STATE_UNAUTHORIZED;
      this._isRegistered = true;
      this._accountDeviceNumber = data.accountDeviceNumber;

      this._emitConnect();
      this.emit(`unauthorized`, data.accountDeviceNumber);
      return;
    }

    case `id`: {
      if (state !== DeviceSession.STATE_UNKNOWN &&
          state !== DeviceSession.STATE_UNAUTHORIZED) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      log.info(`Received device identification information`);
      this._manufacturer = data.manufacturer;
      this._model = data.model;
      this._version = data.version;
      // TODO: see https://github.com/silklabs/silk-app/issues/597
      // eslint-disable-next-line no-constant-condition
      if (false && (`image` in data)) {
        this._image = new Buffer(data.image);
      }

      this._state = DeviceSession.STATE_ID_RECEIVED;
      return;
    }

    case `registered`: {
      if (!this.paired) {
        const error =
          new Error(`Received '${data.name}' on an unpaired stream`);
        this._emitError(error);
        return;
      }

      if (this._socketSession.publicKey !== data.deviceId) {
        const message = `Authentication key does not match device id`;
        log.warn(message, this._socketSession.publicKey, data.deviceId);
        this._emitError(new Error(message));
        return;
      }

      if (state !== DeviceSession.STATE_ID_RECEIVED) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      this._isRegistered = true;
      this._deviceId = data.deviceId;
      this._accountDeviceNumber = data.accountDeviceNumber;

      this._state = DeviceSession.STATE_REGISTERED;
      if (!this._connectEmitted) {
        this._emitConnect();
      }
      this._emitRegistered();
      return;
    }

    case `status`: {
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET &&
          state !== DeviceSession.STATE_REGISTERED) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      const status = {
        // TODO: Real status messages.
        message: data.code,
        isError: false,
      };
      if (data.type === `wifi`) {
        this._wifiStatus = status;
      } else {
        this._serverStatus = status;
      }

      this.emit(`connectionStatus`, data.type, status);
      return;
    }

    case `wifiscan`: {
      this._wifiNetworks = data.networks;
      this.emit(`wifiscan`, this._wifiNetworks);
      return;
    }

    case `wifiinfo`: {
      this._wifiInfo = {
        ssid: data.ssid,
        level: data.level,
      };
      this.emit(`wifiinfo`, this._wifiInfo);
      return;
    }

    case `error`: {
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET &&
          state !== DeviceSession.STATE_REGISTERED) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      const status = {
        // TODO: Real error messages.
        message: data.code,
        isError: true,
      };
      if (data.type === `wifi`) {
        this._wifiStatus = status;
      } else {
        this._serverStatus = status;
      }

      this.emit(`connectionStatus`, data.type, status);
      return;
    }

    case `update`: {
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET &&
          state !== DeviceSession.STATE_REGISTERED) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      const event: UpdateStatusEvent = {
        state: data.state,
        timestamp: data.timestamp,
      };
      if (data.progress) {
        event.progress = data.progress;
      }
      if (data.error) {
        event.error = new Error(data.error);
      }

      this._updateStatusEvent = event;

      this.emit(`updateStatus`, event);
      return;
    }

    case `register`: {
      if (state !== DeviceSession.STATE_ID_RECEIVED &&
          state !== DeviceSession.STATE_RESTARTED) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      this._state = DeviceSession.STATE_REGISTER_REQUESTED;
      if (state !== DeviceSession.STATE_RESTARTED) {
        this._emitConnect();
      } else if (this._acceptRegistrationPending) {
        this.acceptRegistrationRequest();
      }
      return;
    }

    case `secret`: {
      if (state !== DeviceSession.STATE_REGISTERING &&
          state !== DeviceSession.STATE_REGISTERING_PROXIMITY) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      this._deviceId = data.deviceId;
      this._secret = {
        deviceId: data.deviceId,
      };

      this._maybeEmitSecret();
      return;
    }

    case `restart`: {
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      invariant(this._secret);
      invariant(this._secretEmitted);

      this._state = DeviceSession.STATE_REGISTERING_PROXIMITY;
      if (this.listenerCount(`restart`) === 0) {
        // TODO: This could go away once a restart UI has been implemented.
        const error =
          new Error(`Nobody listening to the restart event, disconnecting `);
        this._emitError(error);
      } else {
        this.emit(`restart`);
      }
      return;
    }

    case `complete`: {
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET) {
        const error =
          new Error(`Received '${data.name}' while in state ${state}`);
        this._emitError(error);
        return;
      }

      this._state = DeviceSession.STATE_REGISTERED;
      this._isRegistered = true;
      this._accountDeviceNumber = data.accountDeviceNumber;
      this._emitRegistered();
      return;
    }

    default:
      throw new Error(`Unhandled message: '${data.name}'`);
    }
  }

  _onRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`DeviceSession._onRssiUpdate(${rssi})`);

    if (this._state === DeviceSession.STATE_ERROR) {
      log.debug(`Received rssi update while in the ERROR state, ignoring`);
      return;
    }

    invariant(this._state === DeviceSession.STATE_REGISTERING);

    if (rssi < DeviceSession.RSSI_THRESHOLD) {
      this.emit(`rssiUpdate`, rssi);
      return;
    }

    log.info(`Passed proximity gate`);

    this._socketSession.rssiUpdatesEnabled = false;
    this._socketSession.setPaired(this._deviceId);
    this._state = DeviceSession.STATE_REGISTERING_PROXIMITY;

    this._maybeEmitSecret();
  };

  get socketId(): number {
    return this._id;
  }

  get authenticated(): boolean {
    return this._socketSession.authenticated;
  }

  get paired(): boolean {
    return this._socketSession.paired;
  }

  get manufacturer(): string {
    return this._manufacturer;
  }

  get model(): string {
    return this._model;
  }

  get version(): string {
    return this._version;
  }

  get image(): ?Buffer {
    return this._image;
  }

  get isUnauthorized(): boolean {
    return this._state === DeviceSession.STATE_UNAUTHORIZED;
  }

  get isRegistered(): boolean {
    return this._isRegistered;
  }

  get deviceId(): ?string {
    return this._deviceId;
  }

  get accountDeviceNumber(): ?number {
    return this._accountDeviceNumber;
  }

  get secret(): ?DeviceSecret {
    return this._secret;
  }

  get wifiStatus(): ?DeviceStatus {
    return this._wifiStatus;
  }

  get wifiNetworks(): ?Array<DeviceWifiNetwork> {
    return this._wifiNetworks;
  }

  get wifiInfo(): ?DeviceWifiInfo {
    return this._wifiInfo;
  }

  get serverStatus(): ?DeviceStatus {
    return this._serverStatus;
  }

  get updateStatus(): ?UpdateStatusEvent {
    return this._updateStatusEvent;
  }

  get error(): ?Error {
    return this._error;
  }

  /**
   * Accept the device's registration request.
   *
   * This signals to an unconfigured device that the user wants to
   * configure it.
   */
  acceptRegistrationRequest() {
    log.debug(`DeviceSession.acceptRegistrationRequest()`);

    if (this._state === DeviceSession.STATE_ERROR) {
      log.warn(`Cannot accept registration because the session is in the ` +
               `ERROR state, ignoring`);
      return;
    }

    // It's possible we're being asked to configure the device again
    // while we're still waiting for it to acknowledge the restart of
    // the configuration process. Let's still honor that request,
    // just wait until the device has confirmed the new state.
    if (this._state === DeviceSession.STATE_RESTARTED) {
      this._acceptRegistrationPending = true;
      return;
    }

    invariant(this._state === DeviceSession.STATE_REGISTER_REQUESTED);
    this._acceptRegistrationPending = false;

    this._state = DeviceSession.STATE_REGISTERING;
    this._socketSession.write({
      name: `accept`,
    });
    this._socketSession.rssiUpdatesEnabled = true;
  }

  /**
   * Decline the device's registration request
   *
   * This indicates to the device that the user does not want to
   * configure it, at least not using this app. The BLE socket
   * connection is expected to be closed after this.
   */
  declineRegistrationRequest() {
    log.debug(`DeviceSession.declineRegistrationRequest()`);

    if (this._state === DeviceSession.STATE_ERROR) {
      log.warn(`Cannot reject registration because the session is in the ` +
               `ERROR state, ignoring`);
      return;
    }

    invariant(this._state === DeviceSession.STATE_ID_RECEIVED ||
              this._state === DeviceSession.STATE_REGISTER_REQUESTED ||
              this._state === DeviceSession.STATE_REGISTERING ||
              this._state === DeviceSession.STATE_REGISTERING_PROXIMITY ||
              this._state === DeviceSession.STATE_REGISTERING_SENT_SECRET ||
              this._state === DeviceSession.STATE_RESTARTED);

    this._state = DeviceSession.STATE_DISMISSED;
    this._socketSession.write({
      name: `decline`,
    });
    this._socketSession.disconnect();
  }

  /**
   * Send registration information to the device.
   *
   * This sends WiFi and other configuration data to the device. The
   * device is expected to send `status` messages as it connects to
   * the WiFi network, registers with the server, etc.
   */
  sendRegistrationInformation(config: RegistrationInformation) {
    log.debug(`DeviceSession.sendRegistrationInformation()`);

    invariant(this._state === DeviceSession.STATE_REGISTERING_PROXIMITY);
    invariant(this._secretEmitted);

    this._socketSession.write({
      name: `secret`,
      ...config,
    });

    this._state = DeviceSession.STATE_REGISTERING_SENT_SECRET;
  }

  /**
   * Restart the configuration process.
   *
   * This indicates to the device that the user has aborted the
   * configuration process. The device is expected to go back to
   * requesting configuration.
   */
  restart() {
    log.debug(`DeviceSession.restart()`);

    if (this._state === DeviceSession.STATE_ERROR) {
      log.debug(`Cannot restart while in the ERROR state, ignoring.`);
      return;
    }

    if (this._state === DeviceSession.STATE_RESTARTED) {
      log.info(`Already restarting configuration process. Ignoring.`);
      return;
    }

    invariant(this._state === DeviceSession.STATE_REGISTERING ||
              this._state === DeviceSession.STATE_REGISTERING_PROXIMITY);

    this._state = DeviceSession.STATE_RESTARTED;
    this._socketSession.rssiUpdatesEnabled = false;
    this._secret = null;
    this._secretEmitted = false;

    this._socketSession.write({
      name: `restart`,
    });

    this.emit(`restarted`);
  }

  /**
   * Dismiss the BLE socket connection.
   *
   * This indicates to the device that the app has successfully
   * received data through the server connection, and the BLE socket
   * can be closed.
   */
  dismiss: (() => void) = () => {
    this.emit(`dismissed`);

    // The server connection and BLE sockets can race each other. If
    // we happen to be able to confirm a socket.io connection to the
    // device and want to dismiss the socket before we've confirmed a
    // successful configuration, wait for the BLE socket to catch up.
    if (this._state === DeviceSession.STATE_REGISTERING_SENT_SECRET) {
      this.once(`registered`, this.dismiss);
      return;
    }

    invariant(this._state === DeviceSession.STATE_REGISTERED);
    this._state = DeviceSession.STATE_DISMISSED;
    this._socketSession.write({
      name: `dismiss`,
    });
    this._socketSession.disconnect();
  };

  disconnect() {
    log.debug(`DeviceSession.disconnect()`);

    if (this._state === DeviceSession.STATE_REGISTERED ||
        this._state === DeviceSession.STATE_UNAUTHORIZED) {
      this._state = DeviceSession.STATE_DISMISSED;
    } else {
      this._state = DeviceSession.STATE_ERROR;
    }
    this._socketSession.disconnect();
  }

  listWifi() {
    log.debug(`DeviceSession.listWifi()`);

    if (!this.paired) {
      log.warn(`Ignoring listWifi() on an unpaired stream`);
      return;
    }

    if (this._state !== DeviceSession.STATE_REGISTERED) {
      log.warn(`Ignoring getWifiInfo() in state ${this._state}`);
      return;
    }

    this._socketSession.write({
      name: `wifiScan`,
    });
  }

  selectWifi(config: WifiConfiguration) {
    log.debug(`DeviceSession.selectWifi('${config.accessPoint}')`);

    if (!this.paired) {
      log.warn(`Ignoring selectWifi() on an unpaired stream`);
      return;
    }

    invariant(this._state === DeviceSession.STATE_REGISTERED);

    this._socketSession.write({
      name: `wifiSelect`,
      accessPoint: config.accessPoint,
      password: config.password,
    });
  }

  getWifiInfo() {
    log.debug(`DeviceSession.getWifiInfo()`);

    if (!this.paired) {
      log.warn(`Ignoring getWifiInfo() on an unpaired stream`);
      return;
    }

    if (this._state !== DeviceSession.STATE_REGISTERED) {
      log.warn(`Ignoring getWifiInfo() in state ${this._state}`);
      return;
    }

    this._socketSession.write({
      name: `wifiInfo`,
    });
  }
}
