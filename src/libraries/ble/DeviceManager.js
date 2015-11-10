/**
 * @flow
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import getSocketManager from './SocketManager';
import * as Joi from 'joi-browserify';
import mklog from 'log';
import SocketSession from './SocketSession';

import type { Socket, SocketManager } from './SocketManager';

type DeviceStatus = {
  message: string;
  isError: boolean;
};

type MessageData = {
  name: string;
  // TODO: even better: do union `name`:
  // type MessageData = {...} | {...} | {...};
  [arbitraryKey: string]: string;
};

type RegistrationInformation = {
  accessPoint: string;
  password: string;
  publicKey: string;
  regToken: string;
};

type DeviceSecret = {
  deviceId: string;
};

const log = mklog('btle-DeviceManager');

const SCHEMA = {
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
    deviceId: Joi.string().lowercase().trim().length(66).hex().required(),
  }).required(),

  status: Joi.object().keys({
    name: Joi.string().equal(`status`).required(),
    status: Joi.string().required(),
  }).required(),

  error: Joi.object().keys({
    name: Joi.string().equal(`error`).required(),
    code: Joi.string().required(),
  }).required(),

  register: Joi.object().keys({
    name: Joi.string().equal(`register`).required(),
  }).required(),

  secret: Joi.object().keys({
    name: Joi.string().equal(`secret`).required(),
    deviceId: Joi.string().lowercase().trim().length(66).hex().required(),
  }).required(),

  restart: Joi.object().keys({
    name: Joi.string().equal(`restart`).required(),
  }).required(),

  complete: Joi.object().keys({
    name: Joi.string().equal(`complete`).required(),
  }).required(),
};

let singletonInstance = null;

export class DeviceSession extends EventEmitter {
  static STATE_UNKNOWN = 0;
  static STATE_ID_RECEIVED = 1;
  static STATE_REGISTER_REQUESTED = 2;
  static STATE_REGISTERING = 3;
  static STATE_REGISTERING_PROXIMITY = 4;
  static STATE_REGISTERING_SENT_SECRET = 5;
  static STATE_REGISTERED = 6;
  static STATE_DISMISSED = 7;
  static STATE_RESTARTED = 8;

  static STATE_ERROR = 10;

  static RSSI_THRESHOLD = -40;
  static HEARTBEAT_PROP_NAME = `_<3_<3_<3_`;

  _socketSession: SocketSession;

  _state: number = DeviceSession.STATE_UNKNOWN; // TODO number -> string enum
  _secret: ?DeviceSecret = null;

  _manufacturer: string = ``;
  _model: string = ``;
  _version: string = ``;
  _image: ?Buffer = null;

  _status: ?DeviceStatus = null;

  _connectEmitted: boolean = false;
  _registeredEmitted: boolean = false;
  _secretEmitted: boolean = false;
  _acceptRegistrationPending: boolean = false;

  constructor(socket: Socket) {
    log.debug(`DeviceSession()`);

    super();

    const socketSession = new SocketSession(socket);
    socketSession.addListener(`error`, this._onError);
    socketSession.addListener(`data`, this._onData);
    socketSession.addListener(`rssiUpdate`, this._onRssiUpdate);

    this._socketSession = socketSession;
  }

  _validateData(data: MessageData): boolean {
    log.debug(`DeviceSession._validateData(%j)`, data);

    if (!data || (typeof data !== `object`)) {
      return false;
    }

    if ((DeviceSession.HEARTBEAT_PROP_NAME in data) &&
        data[DeviceSession.HEARTBEAT_PROP_NAME] === null) {
      return true;
    }

    if (!(`name` in data)) {
      log.warn(`Data has no 'name' proptery`);
      return false;
    }

    if (!(data.name in SCHEMA)) {
      log.warn(`Data has unexpected 'name' property: '${data.name}'`);
      return false;
    }

    let error;
    Joi.validate(data, SCHEMA[data.name], (err, val) => {
      error = err;
    });

    if (error) {
      log.warn(`Data failed validation`, error);
      return false;
    }

    return true;
  }

  _forceDisconnect() {
    log.debug(`DeviceSession._forceDisconnect()`);

    this._state = DeviceSession.STATE_ERROR;
    this._socketSession.rssiUpdatesEnabled = false;
    this._socketSession.disconnect();
  }

  _emitConnect() {
    log.debug(`DeviceSession._emitConnect()`);

    assert(this._state === DeviceSession.STATE_REGISTER_REQUESTED ||
           this._state === DeviceSession.STATE_REGISTERED);
    assert(!this._connectEmitted);
    this._connectEmitted = true;

    singletonInstance && singletonInstance.emit(`connect`, this);
  }

  _emitRegistered() {
    log.debug(`DeviceSession._emitRegistered()`);

    assert(this._state === DeviceSession.STATE_REGISTERED);
    assert(!this._registeredEmitted);
    this._registeredEmitted = true;

    this.emit(`registered`);
  }

  _maybeEmitSecret() {
    log.debug(`DeviceSession._maybeEmitSecret()`);

    assert(this._state === DeviceSession.STATE_REGISTERING ||
           this._state === DeviceSession.STATE_REGISTERING_PROXIMITY);
    assert(!this._secretEmitted);

    if (this._state === DeviceSession.STATE_REGISTERING_PROXIMITY &&
        this._secret) {
      this._secretEmitted = true;
      this.emit(`secret`, this._secret);
    }
  }

  _onError: ((error: Error) => void) = (error) => {
    log.debug(`DeviceSession._onError('${error.toString()}')`);

    log.warn(`Session error, disconnecting`, error);
    this._forceDisconnect();
  };

  _onData: ((data: MessageData) => void) = (data) => {
    log.debug(`DeviceSession._onData()`, data);

    if (!this._validateData(data)) {
      this._forceDisconnect();
      return;
    }

    // Send the heartbeat straight back.
    if (DeviceSession.HEARTBEAT_PROP_NAME in data &&
        data[DeviceSession.HEARTBEAT_PROP_NAME] === null) {
      this._socketSession.write(data);
      return;
    }

    const state = this._state;
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
    case `id`:
      if (state !== DeviceSession.STATE_UNKNOWN) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      log.info(`Received device identification information`);
      this._manufacturer = data.manufacturer;
      this._model = data.model;
      this._version = data.version;
      // TODO: see https://github.com/silklabs/silk-app/issues/597
      if (false && (`image` in data)) {
        this._image = new Buffer(data.image);
      }

      this._state = DeviceSession.STATE_ID_RECEIVED;
      return;

    case `registered`:
      if (state !== DeviceSession.STATE_ID_RECEIVED) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._state = DeviceSession.STATE_REGISTERED;
      this._emitConnect();
      this._emitRegistered();
      return;

    case `status`:
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET &&
          state !== DeviceSession.STATE_REGISTERED) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._status = {
        message: data.status,
        isError: false,
      };
      this.emit(`status`, this._status);
      return;

    case `error`:
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET &&
          state !== DeviceSession.STATE_REGISTERED) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._status = {
        message: data.error,
        isError: true,
        errorCode: 0, // TODO: Real error codes?
      };
      this.emit(`status`, this._status);
      return;

    case `register`:
      if (state !== DeviceSession.STATE_ID_RECEIVED &&
          state !== DeviceSession.STATE_RESTARTED) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._state = DeviceSession.STATE_REGISTER_REQUESTED;
      if (state !== DeviceSession.STATE_RESTARTED) {
        this._emitConnect();
      } else if (this._acceptRegistrationPending) {
        this.acceptRegistrationRequest();
      }
      return;

    case `secret`:
      if (state !== DeviceSession.STATE_REGISTERING &&
          state !== DeviceSession.STATE_REGISTERING_PROXIMITY) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._secret = {
        deviceId: data.deviceId,
      };

      this._maybeEmitSecret();
      return;

    case `restart`:
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      assert(this._secret);
      assert(this._secretEmitted);

      this._state = DeviceSession.STATE_REGISTERING_PROXIMITY;
      this.emit(`restart`);
      return;

    case `complete`:
      if (state !== DeviceSession.STATE_REGISTERING_SENT_SECRET) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._state = DeviceSession.STATE_REGISTERED;
      this._emitRegistered();
      return;

    default:
      throw new Error(`Unhandled message: '${data.name}'`);
    }

    this._forceDisconnect();
  };

  _onRssiUpdate: ((rssi: number) => void) = (rssi) => {
    log.debug(`DeviceSession._onRssiUpdate(${rssi})`);

    if (this._state === DeviceSession.STATE_ERROR) {
      log.debug(`Received rssi update while in the ERROR state, ignoring`);
      return;
    }

    assert(this._state === DeviceSession.STATE_REGISTERING);

    if (rssi < DeviceSession.RSSI_THRESHOLD) {
      this.emit(`rssiUpdate`, rssi);
      return;
    }

    log.info(`Passed proximity gate`);

    this._socketSession.rssiUpdatesEnabled = false;
    this._state = DeviceSession.STATE_REGISTERING_PROXIMITY;

    this._maybeEmitSecret();
  };

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

  get statusMessage(): string {
    return this._statusMessage;
  }

  get errorMessage(): string {
    return this._errorMessage;
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
      log.warn(`Cannot begin registration because the session is in the ` +
               `ERROR state, ignoring`);
      return;
    }

    // It's possible we're being asked to configure the device again
    // while we're still waiting for it to acknowledge the restart of
    // the configuration process. Let's still honour that request,
    // just wait until the device has confirmed the new state.
    if (this._state === DeviceSession.STATE_RESTARTED) {
      this._acceptRegistrationPending = true;
      return;
    }

    assert(this._state === DeviceSession.STATE_REGISTER_REQUESTED);
    this._acceptRegistrationPending = false;

    this._socketSession.write({
      name: `accept`,
    });
    this._socketSession.rssiUpdatesEnabled = true;
    this._state = DeviceSession.STATE_REGISTERING;
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

    this._socketSession.write({
      name: `decline`,
    });
    this._forceDisconnect();
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

    assert(this._state === DeviceSession.STATE_REGISTERING_PROXIMITY);
    assert(this._secretEmitted);

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

    assert(this._state === DeviceSession.STATE_REGISTERING ||
           this._state === DeviceSession.STATE_REGISTERING_PROXIMITY);

    this._state = DeviceSession.STATE_RESTARTED;
    this._socketSession.rssiUpdatesEnabled = false;
    this._secret = null;
    this._secretEmitted = false;

    this._socketSession.write({
      name: `restart`,
    });
  }

  /**
   * Dismiss the BLE socket connection.
   *
   * This indicates to the device that the app has successfully
   * received data through the server connection, and the BLE socket
   * can be closed.
   */
  dismiss: (() => void) = () => {
    // The server connection and BLE sockets can race each other. If
    // we happen to be able to confirm a socket.io connection to the
    // device and want to dismiss the socket before we've confirmed a
    // successful configuration, wait for the BLE socket to catch up.
    if (this._state === DeviceSession.STATE_REGISTERING_SENT_SECRET) {
      this.once(`registered`, this.dismiss);
      return;
    }

    assert(this._state === DeviceSession.STATE_REGISTERED);
    this._socketSession.write({
      name: `dismiss`,
    });
    this._state = DeviceSession.STATE_DISMISSED;
  };
}

class DeviceManager extends EventEmitter {
  _devices: Map<Socket, DeviceSession> = new Map();
  _socketManager: SocketManager;

  constructor() {
    log.debug(`DeviceManager()`);

    super();

    this._socketManager = getSocketManager();
    this._socketManager.on(`connect`, this._onConnect);
    this._socketManager.on(`disconnect`, this._onDisconnect);
  }

  _onConnect: ((socket: Socket) => void) = (socket) => {
    log.debug(`DeviceManager._onConnect()`);

    assert(!this._devices.has(socket));

    let device = new DeviceSession(socket);
    this._devices.set(socket, device);
  };

  _onDisconnect: ((socket: Socket) => void) = socket => {
    log.debug(`DeviceManager._onDisconnect()`);

    let device = this._devices.get(socket);
    if (device) {
      device.emit(`disconnect`);
    }
    this._devices.delete(socket);
  };
}


export default function getDeviceManager(): EventEmitter {
  if (!singletonInstance) {
    singletonInstance = new DeviceManager();
  }

  let emitter = new EventEmitter();
  emitter.on('newListener', (event, listener) => {
    singletonInstance && singletonInstance.addListener(event, listener);
  });
  emitter.on('removeListener', (event, listener) => {
    singletonInstance && singletonInstance.removeListener(event, listener);
  });

  return emitter;
}
