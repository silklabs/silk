/**
 * @flow
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import getSocketManager from './SocketManager';
import * as Joi from 'joi-browserify';
import mklog from 'log';
import SocketSession from './SocketSession';

const log = mklog('btle-DeviceManager');

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

let singletonInstance = null;

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

  rssi: Joi.object().keys({
    name: Joi.string().equal(`rssi`).required(),
    rssi: Joi.number().integer().min(-100).max(0).required(),
  }).required(),

  secret: Joi.object().keys({
    name: Joi.string().equal(`secret`).required(),
    deviceId: Joi.string().lowercase().trim().length(66).hex().required(),
  }).required(),

  restart: Joi.object().keys({
    name: Joi.string().equal(`restart`).required(),
    error: Joi.string().required(),
  }).required(),

  complete: Joi.object().keys({
    name: Joi.string().equal(`complete`).required(),
  }).required(),
};

export class DeviceSession extends EventEmitter {
  static STATE_UNKNOWN = 0;
  static STATE_ID_RECEIVED = 1;
  static STATE_REGISTER_REQUESTED = 2;
  static STATE_REGISTERING = 3;
  static STATE_REGISTERING_PROXIMITY = 4;
  static STATE_REGISTERING_SENT_SECRET = 5;
  static STATE_REGISTERED = 6;
  static STATE_DISMISSED = 7;

  static STATE_ERROR = 10;

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

    this._state = SocketSession.STATE_ERROR;
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

    const state = this._state;
    if (state === DeviceSession.STATE_ERROR) {
      log.debug(`Received data while in the ERROR state, ignoring`);
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
      if (state !== DeviceSession.STATE_ID_RECEIVED) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this._state = DeviceSession.STATE_REGISTER_REQUESTED;
      this._emitConnect();
      return;

    case `rssi`:
      if (state !== DeviceSession.STATE_REGISTERING &&
          state !== DeviceSession.STATE_REGISTERING_PROXIMITY &&
          state !== DeviceSession.STATE_REGISTERING_SENT_SECRET) {
        log.warn(`Received '${data.name}' while in state ${state}`);
        break;
      }

      this.emit(`rssiUpdate`, data.rssi);
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
      this.emit(`restart`, data.error);
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

    assert(this._state >= DeviceSession.STATE_REGISTERING);

    if (this._state === DeviceSession.STATE_REGISTERING && rssi >= -40) {
      log.info(`Passed proximity gate`);
      this._socketSession.rssiUpdatesEnabled = false;
      this._state = DeviceSession.STATE_REGISTERING_PROXIMITY;
      this._maybeEmitSecret();
    }
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

  respondToRegistrationRequest(accept: boolean) {
    log.debug(`DeviceSession.respondToRegistrationRequest(${accept})`);

    if (this._state === DeviceSession.STATE_ERROR) {
      log.warn(`Cannot begin registration because the session is in the ` +
               `ERROR state, ignoring`);
      return;
    }

    assert(this._state === DeviceSession.STATE_REGISTER_REQUESTED);

    if (accept) {
      this._socketSession.write({
        name: `accept`,
      });
      this._socketSession.rssiUpdatesEnabled = true;
      this._state = DeviceSession.STATE_REGISTERING;
      return;
    }

    this._socketSession.write({
      name: `decline`,
    });
    this._forceDisconnect();
  }

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

  dismiss: (() => void) = () => {
    // socket.io and BLE sockets can race each other. If we happen to
    // be able to confirm a socket.io connection to the device and
    // want to dismiss the socket before we've confirmed a successful
    // configuration, wait for the BLE socket to catch up.
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
