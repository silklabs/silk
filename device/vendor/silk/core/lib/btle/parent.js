/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import EventEmitter from 'events';
import fs from 'mz/fs';
import invariant from 'assert';
import * as net from 'net';
import path from 'path';
import {unlinkSync} from 'fs';
import {createDeferred} from 'silk-async-utils';
import {getboolprop, getintprop, getstrprop} from 'silk-sysutils';

import api from 'silk-device-api';
import createLog from 'silk-log/device';
import {fork} from 'silk-process';
import getDeviceId from '../deviceid';
import * as Metrics from '../metrics/btle';
import ParentSocketSession from './parent_socket_session';
import validateMessage from './validate_process_message';

import type {ChildProcess} from 'child_process';
import type {Server, Socket} from 'net';
import type {AccessToken} from 'silk-api';
import type {Deferred} from 'silk-async-utils';

export type BluetoothMode = 'off' | 'on' | 'beacon';
export type AdvertisingInfo = {
  uuid: string;
  id: number;
};

type sendMessage = Object;
type sendHandle = any;

type QueuedMessage = {
  message: sendMessage;
  handle: ?sendHandle;
};

const BT_HW_ENABLED = getboolprop('ro.silk.bt.hw.enabled', true);
const BT_MANUFACTURER_CODE = getintprop(`ro.silk.bt.manufacturer`, 0x517c);
const BT_DEVICE_TYPE = getintprop(`ro.silk.bt.deviceType`, 0);

// TODO: This needs to be measured and customized for each type of device we
//       ship.
// This is the transmit power measured against a Nexus 4 at 1 meter distance.
const BT_BEACON_POWER: number = getintprop(`ro.silk.bt.txPower`, -60);

// This works because our cwd is / on device and something accessible on sim. If
// we ever change cwd this will break...
const SOCKET_PATH = path.join(`dev`, `socket`, `node-btle`);

const log = createLog(`btle`);

function randomInt(min: number = 0, max: number = 1e6): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class BluetoothLE extends EventEmitter {
  static MODE_OFF: string = `off`;
  static MODE_ON: string = `on`;
  static MODE_BEACON: string = `beacon`;

  MODE_OFF: string = BluetoothLE.MODE_OFF;
  MODE_ON: string = BluetoothLE.MODE_ON;
  MODE_BEACON: string = BluetoothLE.MODE_BEACON;

  _accessToken: AccessToken;
  _child: ?ChildProcess = null;
  _server: ?Server = null;

  _mode: BluetoothMode = BluetoothLE.MODE_OFF;
  _pairedPublicKeys: Array<string> = [];
  _unpairedPublicKeys: Array<string> = [];
  _advertisingInfo: ?AdvertisingInfo = null;

  _childProcessDeferred: Deferred<void> = createDeferred();
  _childProcessInitialized: boolean = false;

  _messageQueue: Array<QueuedMessage> = [];
  _sendingMessage: boolean = false;

  _server: ?Server = null;
  _socketSessions: Array<ParentSocketSession> = [];

  _deferreds: Map<number, Deferred<void>> = new Map();

  constructor() {
    log.debug(`constructor`);

    super();

    this._accessToken = getDeviceId();
  }

  get mode(): BluetoothMode {
    return this._mode;
  }

  setPublicKeys(paired: Array<string>, unpaired: Array<string>) {
    invariant(Array.isArray(paired));
    invariant(Array.isArray(unpaired));

    if (BT_HW_ENABLED) {
      this._sendMessage({
        name: `publicKeys`,
        paired,
        unpaired,
      });
    }

    this._pairedPublicKeys = paired;
    this._unpairedPublicKeys = unpaired;
  }

  get advertisingInfo(): AdvertisingInfo {
    return {...this._advertisingInfo};
  }

  set advertisingInfo(value: AdvertisingInfo) {
    invariant(this._mode === BluetoothLE.MODE_OFF);

    const advertisingInfo: AdvertisingInfo = {
      uuid: ``,
      id: 0,
    };

    advertisingInfo.uuid = value.uuid;
    advertisingInfo.id = value.id;

    if (BT_HW_ENABLED) {
      this._sendMessage({
        name: `advertisingInfo`,
        advertisingInfo,
      });
    }

    this._advertisingInfo = advertisingInfo;
  }

  changeMode(mode: BluetoothMode): Promise<void> {
    log.debug(`changeMode`, mode);

    if (!BT_HW_ENABLED) {
      log.warn(`Bluetooth hardware unavailable, cannot change mode`);
      return Promise.resolve();
    }

    switch (mode) {
    case BluetoothLE.MODE_OFF:
      break;

    case BluetoothLE.MODE_ON:
    case BluetoothLE.MODE_BEACON:
      invariant(this._advertisingInfo);
      break;

    default:
      throw new Error(`Invalid mode '${mode}'`);
    }

    const [promise, promiseId] = this._createPromisePair();

    this._sendMessage({
      name: `mode`,
      mode,
      promiseId,
    });

    return promise;
  }

  _startChildProcess(): Promise<void> {
    log.debug(`_startChildProcess`);

    invariant(BT_HW_ENABLED);

    const processName = `btle`;

    const mainModule = getstrprop(`persist.silk.main`, `silk-device-main`);

    const childPath = path.join(
      'system/silk/node_modules',
      mainModule,
      'lib/btle/child',
    );

    const child = fork(childPath, {
      name: `btle`,
      restart: true,
    });

    log.info(`Launched '${processName}' with pid ${child.pid}`);
    this._setChild(child);

    return this._childProcessDeferred.promise;
  }

  async _startSocketServer(): Promise<void> {
    log.debug(`_startSocketServer`);

    log.info(`Creating socket server`, SOCKET_PATH);

    try {
      await fs.unlink(SOCKET_PATH);
    } catch (error) {
      if (error.code !== `ENOENT`) {
        throw error;
      }
    }

    const server = net.createServer({
      allowHalfOpen: true,
      pauseOnConnect: true,
    });

    const deferredListen = createDeferred();

    const errorListener = (error) => {
      server.removeListener(`error`, errorListener);
      deferredListen.reject(error);
    };
    server.addListener(`error`, errorListener);

    server.listen(SOCKET_PATH, () => {
      server.removeListener(`error`, errorListener);
      deferredListen.accept();
    });

    process.once(`exit`, () => {
      log.info(`Cleaning up socket server`, SOCKET_PATH);
      try {
        unlinkSync(SOCKET_PATH);
      } catch (error) {
        if (error.code !== `ENOENT`) {
          throw error;
        }
      }
    });

    await deferredListen.promise;

    this._setServer(server);
  }

  async _startAll(): Promise<void> {
    log.debug(`_startAll`);

    if (!BT_HW_ENABLED) {
      log.warn(`Bluetooth hardware unavailable`);
      return;
    }

    await this._startSocketServer();
    invariant(this._server);

    await this._startChildProcess();
    invariant(this._child);
  }

  async _start(): Promise<void> {
    log.debug(`_start`);

    try {
      await this._startAll();
    } catch (error) {
      log.error(`Failed to start`, error);

      if (this._child) {
        // Evil, but flow doesn't know about our custom 'cancelRestart'
        // function and it's not worth making a new class to extend it.
        const child: Object = this._child;
        child.cancelRestart();

        this._killChild();
      }

      if (this._server) {
        this._setServer(null);
      }

      throw error;
    }
  }

  _createPromisePair(): [Promise<void>, number] {
    let id;
    do {
      id = randomInt();
    } while (this._deferreds.get(id));

    const deferred = createDeferred();
    this._deferreds.set(id, deferred);

    return [deferred.promise, id];
  }

  _handlePromiseResponse(message: any): void {
    log.debug(`_handlePromiseResponse`, message);

    const id = message.promiseId;
    const deferred = this._deferreds.get(id);
    if (!deferred) {
      throw new Error(`No deferred for id ${id}`);
    }

    this._deferreds.delete(id);

    if (message.error) {
      const error = new Error(message.error.message);
      log.error(message.error.stack);
      deferred.reject(error);
    } else {
      deferred.accept();
    }
  }

  _killChild(signal: string = `SIGKILL`): void {
    log.debug(`_killChild`, signal);

    const child = this._child;
    if (!child) {
      return;
    }

    if (this._childProcessInitialized) {
      this._childProcessDeferred = createDeferred();
      this._childProcessInitialized = false;
    }

    this._setChild(null);

    log.info(`Killing child with pid ${child.pid}`);
    child.kill(signal);
  }

  _sendMessage(message: sendMessage, handle?: sendHandle = null): void {
    log.debug(`_sendMessage`, message);

    invariant(BT_HW_ENABLED);

    validateMessage.out(message);

    this._messageQueue.push({message, handle});

    if (this._sendingMessage) {
      log.debug(`Waiting for previous message to be sent`);
      return;
    }

    this._sendNextMessage();
  }

  _sendNextMessage(): void {
    log.debug(`_sendNextMessage`);

    invariant(BT_HW_ENABLED);
    invariant(!this._sendingMessage);

    if (!this._messageQueue.length) {
      log.debug(`No more messages to send`);
      return;
    }

    if (!this._child || !this._child.connected) {
      log.debug(`Waiting for child to relaunch`);
      return;
    }

    const next = this._messageQueue[0];
    invariant(next);

    const callback = (error) => {
      invariant(this._sendingMessage);
      this._sendingMessage = false;

      if (error) {
        log.warn(`Failed to send message, trying again`, next, error);
      } else {
        // Most of the time this should be 0, but if the child crashed it might
        // be 1.
        const index = this._messageQueue.indexOf(next);
        invariant(index > -1);

        this._messageQueue.splice(index, 1);
      }

      this._sendNextMessage();
    };

    this._sendingMessage = true;

    const shouldSendMore =
      this._child.send(next.message, next.handle, callback);
    if (!shouldSendMore) {
      // This really shouldn't ever happen if we're sending one message at a
      // time...
      log.warn(`Child message pipe full`);
    }
  }

  _setChild(child: ?ChildProcess) {
    log.debug(`_setChild`, child ? `[child]` : `null`);

    invariant(!this._childProcessInitialized);

    const oldChild = this._child;
    if (oldChild) {
      oldChild.removeListener(`exit`, this._onExit);
      oldChild.removeListener(`error`, this._onChildError);
      oldChild.removeListener(`message`, this._onMessage);
    }

    this._child = child;

    if (!child) {
      return;
    }

    child.addListener(`exit`, this._onExit);
    child.addListener(`error`, this._onChildError);
    child.addListener(`message`, this._onMessage);

    child.once(`restart`, (newChild) => {
      log.debug(`_onRestart`);
      this._setChild(newChild);
    });

    const message: Object = {
      name: `initialize`,
      publicKey: this._accessToken.pub,
      privateKey: this._accessToken.priv,
      serverPath: SOCKET_PATH,
      mode: this._mode,
      pairedPublicKeys: this._pairedPublicKeys,
      unpairedPublicKeys: this._unpairedPublicKeys,
      manufacturerCode: BT_MANUFACTURER_CODE,
      deviceType: BT_DEVICE_TYPE,
      beaconPower: BT_BEACON_POWER,
    };
    if (this._advertisingInfo) {
      message.advertisingInfo = this._advertisingInfo;
    }

    validateMessage.out(message);

    // Make sure this is the next message that will be sent.
    this._messageQueue.unshift({
      message,
      handle: null,
    });

    if (!this._sendingMessage) {
      this._sendNextMessage();
    }
  }

  _setServer(server: ?Server): void {
    log.debug(`_setServer`, server ? `[server]` : `null`);

    invariant(!server || path);

    const oldServer = this._server;
    if (oldServer) {
      oldServer.close((error) => {
        if (error) {
          log.error(`Error while closing server`, error);
        }
      });
      oldServer.removeListener(`error`, this._onServerError);
      oldServer.removeListener(`connection`, this._onConnection);
    }

    this._server = server;

    if (!server) {
      return;
    }

    server.addListener(`error`, this._onServerError);
    server.addListener(`connection`, this._onConnection);
  }

  _onExit: ((code: ?number, signal: ?string) => void) = (code, signal) => {
    log.debug(`_onExit`, code, signal);

    if (signal) {
      log.warn(`Child killed with signal '${signal}'`);
    } else if (code !== 0) {
      log.warn(`Child exited with code ${code}`);
    } else {
      log.info(`Child exited normally`);
    }

    if (this._childProcessInitialized) {
      this._childProcessDeferred = createDeferred();
      this._childProcessInitialized = false;
    }
    this._setChild(null);

    if (code || signal) {
      api.metrics.add(new Metrics.ChildProcessCrash(code, signal));
    }
  };

  _onChildError: ((error: Error) => void) = (error) => {
    log.error(`Child:`, error);
    this._killChild();
  };

  _onMessage: ((message: any) => void) = (message) => {
    log.debug(`_onMessage`, message);

    try {
      validateMessage.in(message);

      switch (message.name) {
      case `error`: {
        log.error(`Child error:`, message.message);
        this._killChild();
        break;
      }

      case `initialized`: {
        this._onInitialized(message);
        break;
      }

      case `mode`: {
        this._onMode(message);
        break;
      }

      default:
        log.error(`Unhandled message`, message);
        throw new Error(`Unhandled message '${message.name}'`);
      }
    } catch (error) {
      log.error(error);
      this._killChild();
    }
  };

  _onInitialized(message: any) {
    log.debug(`_onInitialized`, message);

    invariant(!this._childProcessInitialized);
    this._childProcessInitialized = true;
    this._childProcessDeferred.accept();
  }

  _onMode(message: any) {
    log.debug(`_onMode`, message);

    this._mode = message.mode;
    this._handlePromiseResponse(message);
  }

  _onServerError: ((error: Error) => void) = (error) => {
    log.error(`Server:`, error);
    this._killChild();
  };

  _onConnection: ((socket: Socket) => void) = (socket) => {
    log.debug(`_onConnection`);

    const socketSession = new ParentSocketSession(socket);

    socketSession.once(`end`, () => {
      log.info(`Socket session ended`);
      socketSession.end();
    });

    socketSession.once(`close`, () => {
      if (this._socketSessions.length > 1) {
        const index = this._socketSessions.indexOf(socketSession);
        if (index > -1) {
          this._socketSessions.splice(index, 1);
        }
      } else if (this._socketSessions.length === 1 &&
                 this._socketSessions[0] === socketSession) {
        this._socketSessions = [];
      }
    });

    this._socketSessions.push(socketSession);

    invariant(this.listenerCount(`socketSession`));
    this.emit(`socketSession`, socketSession);
  };

}

// TODO: remove 'any' once
// https://github.com/facebook/flow/issues/1170 is resolved
let initPromise: ?Promise<any> = null;
let initPromiseComplete: boolean = false;

export default function(): Promise<any> {
  const init = async () => {
    log.info(`Initializing`);
    invariant(!initPromiseComplete);

    // TODO: remove 'any'
    const instance: any = new BluetoothLE();
    await instance._start();

    log.info(`Initialization complete`);
    initPromiseComplete = true;

    return instance;
  };

  if (initPromise) {
    log.debug(`Already initializ${(initPromiseComplete ? 'ed' : 'ing')}`);
  } else {
    initPromise = init();
  }
  return initPromise;
}
