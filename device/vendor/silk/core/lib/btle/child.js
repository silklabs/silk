/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

// Set up error handling before doing anything else.
let parentConnected = true;

function errorHandler(type: string, error: Error) {
  console.error(`${type}:`, error.stack);      // eslint-disable-line no-console

  if (process.send && parentConnected) {
    try {
      process.send({
        name: `error`,
        type,
        message: error.message,
        stack: error.stack,
      });
    } catch (exception) {
      console.error(exception.stack);          // eslint-disable-line no-console
    }
  }

  // Harsh, but for now...
  console.info(`Aborting`);                    // eslint-disable-line no-console
  process.abort();
}

process.addListener(`uncaughtException`,
                    errorHandler.bind(null, `uncaughtException`));
process.addListener(`unhandledRejection`,
                    errorHandler.bind(null, `unhandledRejection`));

process.once(`disconnect`, () => {
  console.info(`Parent process disconnected`); // eslint-disable-line no-console
  parentConnected = false;
});

// Activate source map support to exception stack traces as early as possible.
import {install as installSourceMapSupport} from '../sourcemaps.js';
installSourceMapSupport();

import bleno from 'bleno';
import invariant from 'assert';
import * as net from 'net';
import noble from 'noble';
import {createDeferred} from 'silk-async-utils';
import createBledroidConnection from 'silk-bledroid';
import {MessagePackDuplexStream, SocketDuplexStream} from 'silk-streams';

import {BluetoothLE} from './parent';
import {createMessage as createInternalMessage} from './socket_message_utils';
import createLog from 'silk-log/device';
import InternalMessageFilterStream from './internal_message_stream';

import ChildSocketSession from './child_socket_session';
import SocketService from './socket_service';
import validateMessage from './validate_process_message';

import type {AdapterState, Peripheral} from 'noble';
import type {Deferred} from 'silk-async-utils';
import type {BledroidConnection} from 'silk-bledroid';

import type {BeaconInfo, BluetoothMode} from './parent';
import type SocketStream from './socket_stream';

type SessionInfo = {
  id: number;
  session: ChildSocketSession;
  socket: InternalMessageFilterStream;
};

const log = createLog(`btle-child`);

class BluetoothLEChild {

  // State that comes from the parent process.
  _privateKey: string = ``;
  _serverPath: string = ``;
  _mode: BluetoothMode = BluetoothLE.MODE_OFF;
  _publicKeys: Array<string> = [];
  _defaultBeaconPower: number = -100;
  _beaconInfo: ?BeaconInfo = null;

  _desiredMode: BluetoothMode = BluetoothLE.MODE_OFF;
  _beaconActive: boolean = false;
  _socketService: ?SocketService = null;

  _changeStatePromise: Promise<void> = Promise.resolve();

  _adapterState: AdapterState = `poweredOff`;
  _adapterStateDeferred: Deferred<void> = createDeferred();
  _adapterStateDeferredAccepted: boolean = false;

  _bledroid: BledroidConnection;
  _bledroidCrashDeferred: ?Deferred<void> = null;

  _sessionInfoMap: Map<number, SessionInfo> = new Map();
  _nextSocketSessionId: number = 0;

  constructor() {
    log.debug(`constructor`);

    this._bledroid = createBledroidConnection();
  }

  async _start(): Promise<void> {
    log.debug(`_start`);

    const waitForPoweredOn: ((api: any, apiName: string) => Promise<void>) = (api, apiName) => {
      const expectedState = `poweredOn`;
      return new Promise((resolve) => {
        if (api.state === expectedState) {
          log.debug(`${apiName} is already '${expectedState}'`);
          resolve();
          return;
        }
        log.debug(`${apiName} waiting for '${expectedState}'`);
        api.addListener(`stateChange`, function listener(state) {
          log.debug(`${apiName} stateChange: '${state}'`);
          if (state === expectedState) {
            api.removeListener(`stateChange`, listener);
            resolve();
          }
        });
      });
    };

    log.info(`Starting`);

    process.addListener(`disconnect`, this._onDisconnect);
    process.addListener(`message`, this._onMessage);
    noble.on(`warning`, this._onNobleWarning);

    try {
      await Promise.all([
        waitForPoweredOn(bleno, `bleno`),
        waitForPoweredOn(noble, `noble`),
      ]);
    } catch (error) {
      this._removeProcessListeners();
      throw error;
    }

    noble.addListener(`stateChange`, this._onAdapterStateChange);

    invariant(bleno.state === noble.state);
    this._adapterState = noble.state;
    this._adapterStateDeferredAccepted = true;
    this._adapterStateDeferred.accept();

    log.info(`Start complete`);
  }

  _removeProcessListeners(): void {
    process.removeListener(`disconnect`, this._onDisconnect);
    process.removeListener(`message`, this._onMessage);
    noble.removeListener(`warning`, this._onNobleWarning);
  }

  async _stop(): Promise<void> {
    log.debug(`_stop`);

    this._removeProcessListeners();
  }

  _onDisconnect: (() => Promise<void>) = async () => {
    log.debug(`_onDisconnect`);
    log.info(`Disconnected`);

    process.removeListener(`disconnect`, this._onDisconnect);
    await this._stop();
  };

  _onNobleWarning: ((message: string) => void) = (message) => {
    log.warn(`Noble warning: '${message}'`);
  };

  _sendMessage(message: Object) {
    log.debug(`_sendMessage`, message);

    validateMessage.out(message);

    invariant(process.send);
    process.send(message);
  }

  _onMessage: ((message: Object) => void) = (message) => {
    log.debug(`_onMessage`, message);
    validateMessage.in(message);

    switch (message.name) {
    case `initialize`: {
      this._onInitialize(message);
      break;
    }

    case `publicKeys`: {
      this._onPublicKeys(message.publicKeys);
      break;
    }

    case `beaconInfo`: {
      this._onBeaconInfo(message.beaconInfo);
      break;
    }

    case `mode`: {
      this._onMode(message.mode, message.promiseId);
      break;
    }

    default:
      log.error(`Unhandled message`, message);
      throw new Error(`Unhandled message '${message.name}'`);
    }
  };

  async _onInitialize(message: Object) {
    log.debug(`_onInitialize`, message);

    invariant(this._mode === BluetoothLE.MODE_OFF);

    this._privateKey = message.privateKey;
    this._serverPath = message.serverPath;
    this._defaultBeaconPower = message.defaultBeaconPower;

    this._onPublicKeys(message.publicKeys);
    this._onBeaconInfo(message.beaconInfo);

    this._desiredMode = message.mode;

    // Wait for the adapter to start.
    await this._adapterStateDeferred.promise;

    // Switch to the proper mode.
    await this._changeMode(message.mode);

    this._sendMessage({
      name: `initialized`,
    });
  }

  _onPublicKeys(publicKeys: Array<string>): void {
    log.debug(`_onPublicKeys`, publicKeys);

    this._publicKeys = publicKeys;
  }

  _onBeaconInfo(beaconInfo: ?BeaconInfo): void {
    log.debug(`_onBeaconInfo`, beaconInfo);

    invariant(this._mode === BluetoothLE.MODE_OFF);

    if (beaconInfo) {
      this._beaconInfo = {
        measuredPower: this._defaultBeaconPower,
        ...beaconInfo,
      };
    } else {
      this._beaconInfo = null;
    }
  }

  _onMode(mode: BluetoothMode, promiseId: number): Promise<void> {
    log.debug(`_onMode`, mode, promiseId);

    switch (mode) {
    case BluetoothLE.MODE_OFF:
      break;

    case BluetoothLE.MODE_ON:
    case BluetoothLE.MODE_BEACON:
      invariant(this._beaconInfo);
      break;

    default:
      throw new Error(`Invalid mode '${mode}'`);
    }

    // If bledroid crashes before we actually set |_mode| then we want to
    // restart in this mode.
    this._desiredMode = mode;

    this._changeStatePromise =
      this._changeStatePromise
        .catch(() => {
          // All previous errors should have been logged already.
        })
        .then(async () => {
          const maxFailureCount = 3;
          let error;
          for (let count = 0; count < maxFailureCount; count++) {
            try {
              await this._changeMode(mode);
              this._sendMessage({
                name: `mode`,
                mode,
                promiseId,
              });
              return;
            } catch (err) {
              error = err;
            }
            log.warn(`Failed to change mode to '${mode}', retrying`, error);
          }

          invariant(error);

          log.warn(`Unable to change mode to '${mode}' after ` +
                   `${maxFailureCount} attempts`,
                   error);
          this._sendMessage({
            name: `mode`,
            mode,
            promiseId,
            error: {
              message: error.message,
              stack: error.stack,
            },
          });
          throw error;
        });
    return this._changeStatePromise;
  }

  async _changeMode(mode: BluetoothMode): Promise<void> {
    log.debug(`_changeMode`, mode);

    if (this._mode === mode) {
      return;
    }

    if (mode === BluetoothLE.MODE_OFF) {
      await this._off();
    } else {
      invariant(this._beaconInfo);

      await this._startAdvertising();

      if (mode === BluetoothLE.MODE_BEACON && !this._beaconActive) {
        await this._startBeacon();
      } else if (mode !== BluetoothLE.MODE_BEACON && this._beaconActive){
        await this._stopBeacon();
      }
    }

    this._mode = mode;
  }

  async _off(): Promise<void> {
    log.debug(`_off`);

    const promises = [];

    if (this._sessionInfoMap.size) {
      log.info(`Waiting for ${this._sessionInfoMap.size} socket sessions to ` +
               `close`);

      const sessionPromises = [];
      this._sessionInfoMap.forEach((sessionInfo) => {
        return new Promise((resolve) => {
          const socketSession = sessionInfo.session;
          socketSession.once(`close`, resolve);
          socketSession.end();
        });
      });

      promises.push(Promise.all(sessionPromises).then(() => {
        log.info(`All socket sessions closed`);
      }));
    }

    const beaconActive = this._beaconActive;
    const socketService = this._socketService;

    let bledroidCrash: ?Deferred<void> = null;

    if (beaconActive || socketService) {
      bledroidCrash = createDeferred();

      invariant(!this._bledroidCrashDeferred);
      this._bledroidCrashDeferred = bledroidCrash;
    }

    if (socketService) {
      log.info(`Waiting for advertising to stop`);

      socketService.removeListener(`connect`, this._onConnect);

      const promise = new Promise((resolve) => {
        bleno.stopAdvertising(resolve);
      });

      invariant(bledroidCrash);

      promises.push(Promise.race([
        bledroidCrash.promise,
        promise,
      ]).then(() => {
        log.info(`Advertising stopped`);
      }));
    }

    if (beaconActive) {
      log.info(`Waiting for beacon to stop`);

      const promise = new Promise((resolve) => {
        const listener = (status) => {
          this._bledroid.removeListener(`beaconStop`, listener);
          if (status) {
            log.warn(`Failed to stop beacon, status = ${status}`);
          }
          resolve();
        };
        this._bledroid.addListener(`beaconStop`, listener);
        this._bledroid.command(`stopBeacon`);
      });

      invariant(bledroidCrash);

      promises.push(Promise.race([
        bledroidCrash.promise,
        promise,
      ]).then(() => {
        log.info(`Beacon stopped`);
      }));
    }

    if (promises.length) {
      try {
        await Promise.all(promises);
      } catch (error) {
        log.warn(error);
      }
      log.info(`Done waiting`);
    }

    if (socketService) {
      invariant(bledroidCrash);

      log.info(`Waiting for socket service to stop`);
      try {
        await Promise.race([
          bledroidCrash.promise,
          socketService.stop(),
        ]);
      } catch (error) {
        log.warn(error);
      }
      log.info(`Done waiting`);
    }

    this._sessionInfoMap.clear();
    this._socketService = null;
    this._beaconActive = false;
    this._bledroidCrashDeferred = null;
  }

  async _startAdvertising(): Promise<void> {
    log.debug(`_startAdvertising`);

    // Make sure that the adapter is on before attempting to start advertising.
    await this._adapterStateDeferred.promise;

    if (this._socketService) {
      return;
    }

    const bledroidCrash = createDeferred();

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = bledroidCrash;

    invariant(this._beaconInfo);
    const service = new SocketService(noble, bleno, this._beaconInfo.uuid);

    const promise = new Promise((resolve, reject) => {
      const callback = error => error ? reject(error) : resolve();
      bleno.setServices([service], callback);
    }).then(() => new Promise((resolve, reject) => {
      const callback = error => error ? reject(error) : resolve();
      bleno.startAdvertising(`Silk`, [service.uuid], callback);
    }));

    try {
      await Promise.race([
        bledroidCrash.promise,
        promise,
      ]);
      service.addListener(`connect`, this._onConnect);
      this._socketService = service;
    } finally {
      this._bledroidCrashDeferred = null;
    }
  }

  async _startBeacon(): Promise<void> {
    log.debug(`_startBeacon`);

    // Make sure that the adapter is on before attempting to start beaconing.
    await this._adapterStateDeferred.promise;

    if (this._beaconActive) {
      return;
    }

    const beaconInfo = this._beaconInfo;
    invariant(beaconInfo);

    const beaconUuid = beaconInfo.uuid.toLowerCase().replace(/[^\da-f]/g, ``);
    invariant(beaconUuid);

    const uuidBuffer = new Buffer(beaconUuid, 'hex');
    invariant(uuidBuffer.length === 16, `Invalid uuid '${beaconUuid}'`);

    const dataLength = 25;
    const data = new Buffer(dataLength);

    let index = 0;

    // iBeacon header.
    data.writeUInt16LE(0x4c, index); // Apple company identifier.
    index += 2;

    data.writeUInt8(0x02, index++); // iBeacon tag.
    data.writeUInt8(0x15, index++); // Size of the iBeacon data.

    // iBeacon uuid.
    uuidBuffer.copy(data, index);
    index += uuidBuffer.length;

    // iBeacon major.
    data.writeUInt16BE(beaconInfo.major, index);
    index += 2;

    // iBeacon minor.
    data.writeUInt16BE(beaconInfo.minor, index);
    index += 2;

    // iBeacon measured power.
    data.writeInt8(beaconInfo.measuredPower, index++);

    invariant(index === dataLength);

    const bledroidCrash = createDeferred();

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = bledroidCrash;

    const promise = new Promise((resolve) => {
      const listener = (status) => {
        this._bledroid.removeListener(`beaconStart`, listener);
        if (status) {
          log.warn(`Failed to start beacon, status = ${status}`);
        }
        resolve();
      };
      this._bledroid.addListener(`beaconStart`, listener);
      this._bledroid.command(`startBeacon ${data.toString('hex')}`);
    });

    try {
      await Promise.race([
        bledroidCrash.promise,
        promise,
      ]);
      this._beaconActive = true;
    } finally {
      this._bledroidCrashDeferred = null;
    }
  }

  async _stopBeacon(): Promise<void> {
    log.debug(`_stopBeacon`);

    if (!this._beaconActive) {
      return;
    }

    const promise = new Promise((resolve) => {
      const listener = (status) => {
        this._bledroid.removeListener(`beaconStop`, listener);
        if (status) {
          log.warn(`Failed to stop beacon, status = ${status}`);
        }
        resolve();
      };
      this._bledroid.addListener(`beaconStop`, listener);
      this._bledroid.command(`stopBeacon`);
    });

    const bledroidCrash = createDeferred();

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = bledroidCrash;

    try {
      await Promise.race([
        bledroidCrash.promise,
        promise,
      ]);
      this._beaconActive = false;
    } finally {
      this._bledroidCrashDeferred = null;
    }
  }

  _onAdapterStateChange: ((adapterState: string) => void) = (adapterState) => {
    log.debug(`_onAdapterStateChange`, adapterState);

    if (this._adapterState === adapterState) {
      return;
    }

    const justCrashed = this._adapterState === `poweredOn`;
    if (justCrashed) {
      log.warn(`Bledroid crashed`);

      // XXX Fix
      //api.metrics.add(new Metrics.BledroidCrash());
    }

    log.info(`Adapter state changed to '${adapterState}'`);
    this._adapterState = adapterState;

    if (adapterState === `poweredOn`) {
      invariant(!this._bledroidCrashDeferred);

      // Make sure that we unblock anyone waiting on the adapter state promise.
      if (!this._adapterStateDeferredAccepted) {
        this._adapterStateDeferred.accept();
        this._adapterStateDeferredAccepted = true;
      }
      return;
    }

    if (!justCrashed) {
      invariant(!this._adapterStateDeferredAccepted);
      return;
    }

    // Make sure that any mode changes wait for bledroid to reconnect.
    this._adapterStateDeferred = createDeferred();
    this._adapterStateDeferredAccepted = false;

    // Make sure that any mode changes that were waiting on bledroid wake up and
    // retry.
    const crashDeferred = this._bledroidCrashDeferred;
    this._bledroidCrashDeferred = null;
    if (crashDeferred) {
      crashDeferred.reject();
    }

    // Make sure that we restart in the correct mode. If the current mode does
    // not match the desired mode then there must be another promise in the
    // chain already that will eventually get us to the right mode. If the mode
    // does match then we need to add a new promise to the end of the chain.
    if (this._mode === this._desiredMode) {
      this._onMode(this._desiredMode);
    }

    // Pretend like we're just changing to OFF.
    try {
      if (this._sessionInfoMap.size) {
        this._sessionInfoMap.forEach((sessionInfo) => {
          sessionInfo.session.end();
        });
      }
      if (this._socketService) {
        this._socketService.stop();
      }
    } catch (error) {
      log.warn(error);
    } finally {
      // Ensure that our state is correct even if something above failed.
      this._sessionInfoMap.clear();
      this._socketService = null;
      this._beaconActive = false;
      this._mode = BluetoothLE.MODE_OFF;
    }
  };

  _onConnect: ((stream: SocketStream, peripheral: Peripheral) => void) = (
    stream,
    peripheral,
  ) => {
    log.debug(`_onConnect`, peripheral.address);

    const id = this._nextSocketSessionId++;
    if (id === 0xffffffff) {
      log.warn(`Exceeded max socket session ids, wrapping around`);
      this._nextSocketSessionId = 0;
    }

    const session = new ChildSocketSession(
      stream,
      peripheral,
      this._privateKey,
      this._publicKeys,
    );
    const socket = net.connect(this._serverPath);

    let connectListener;

    const errorListener = (error) => {
      socket.removeListener(`error`, errorListener);
      socket.removeListener(`connect`, connectListener);

      log.error(error);

      session.end();
      socket.destroy();
    };

    connectListener = () => {
      socket.removeListener(`error`, errorListener);
      socket.removeListener(`connect`, connectListener);

      const socketStream = new SocketDuplexStream(socket);
      const msgpackStream = new MessagePackDuplexStream(socketStream);
      const internalMessageFilterStream =
        new InternalMessageFilterStream(msgpackStream);

      const sessionInfo = {
        id,
        session,
        socket: internalMessageFilterStream,
      };
      this._connectSocketSession(sessionInfo);
    };

    socket.addListener(`error`, errorListener);
    socket.addListener(`connect`, connectListener);
  };

  _connectSocketSession(sessionInfo: SessionInfo): void {
    const {id, session, socket} = sessionInfo;
    log.debug(`_connectSocketSession`, id);

    const oldSessionEmit = session.emit.bind(session);
    session.emit = (event: string, ...args: Array<any>) => {
      this._onSessionEmit(sessionInfo, event, args);
      return oldSessionEmit(event, ...args);
    };

    const socketErrorListener = (error) => {
      log.error(`Socket error`, error);
      session.end();
    };

    const socketInternalMessageListener = (message) => {
      this._onSocketInternalMessage(sessionInfo, message);
    };

    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      log.debug(`Cleaning up socket session`, id);

      session.emit = oldSessionEmit;

      socket.removeListener(`error`, socketErrorListener);
      socket.removeListener(`internalMessage`, socketInternalMessageListener);

      session.unpipe(socket);
      socket.unpipe(session);

      session.end();
      socket.end();

      this._sessionInfoMap.delete(id);
    };

    session.once(`close`, () => {
      log.debug(`Session closed`, id);
      cleanup();
    });

    socket.once(`close`, () => {
      log.debug(`Socket closed`, id);
      cleanup();
    });

    socket.addListener(`error`, socketErrorListener);
    socket.addListener(`internalMessage`, socketInternalMessageListener);

    session.pipe(socket);
    socket.pipe(session);

    this._sessionInfoMap.set(id, sessionInfo);
  }

  _onSessionEmit(
    sessionInfo: SessionInfo,
    event: string,
    args: Array<any>,
  ): void {
    const {id, socket} = sessionInfo;

    switch (event) {
    case `error`: {
      const error = args[0];
      log.error(`Session error`, error);
      socket.writeInternal(createInternalMessage({
        name: `error`,
        message: error.message,
        stack: error.stack,
      }));
      socket.end();
      break;
    }

    case `authenticated`: {
      socket.writeInternal(createInternalMessage({
        name: `authenticated`,
        authenticated: true,
      }));
      break;
    }

    case `unauthenticated`: {
      socket.writeInternal(createInternalMessage({
        name: `authenticated`,
        authenticated: false,
      }));
      break;
    }

    case `rssiUpdate`: {
      socket.writeInternal(createInternalMessage({
        name: `rssi`,
        value: args[0],
      }));
      break;
    }

    default:
      return;
    }

    log.debug(`_onSessionEmit`, id, event);
  }

  _onSocketInternalMessage(sessionInfo: SessionInfo, message: Object): void {
    const {id, session} = sessionInfo;
    log.debug(`_onSocketInternalMessage`, id, message);

    switch (message.name) {
    case `allowUnauthenticated`: {
      session.allowUnauthenticated(message.allow);
      break;
    }

    case `rssi`: {
      session.rssiUpdatesEnabled = message.enabled;
      break;
    }

    default:
      log.error(`Unhandled message`, message);
      throw new Error(`Unhandled message '${message.name}'`);
    }

  }
}

async function main(): Promise<void> {
  const instance = new BluetoothLEChild();
  return instance._start();
}

main();
