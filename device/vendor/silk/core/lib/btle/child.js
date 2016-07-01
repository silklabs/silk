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
    } catch(exception) {
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
import {MessagePackDuplexStream, SocketDuplexStream} from 'silk-streams';

import {BluetoothLE} from './parent';
import createDeferred from '../deferred';
import {createMessage as createInternalMessage} from './socket_message_utils';
import createLog from 'silk-log/device';
import InternalMessageFilterStream from './internal_message_stream';

import SocketScanner from './socket_scanner';
import ChildSocketSession from './child_socket_session';
import validateMessage from './validate_process_message';

import type {AdapterState, Peripheral} from 'noble';

import type {BeaconInfo, BluetoothMode} from './parent';
import type {Deferred} from '../deferred';

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
  _advertising: boolean = false;
  _changeStatePromise: Promise<void> = Promise.resolve();

  _adapterState: AdapterState = `poweredOff`;
  _adapterStateDeferred: Deferred<void> = createDeferred();
  _adapterStateDeferredAccepted: boolean = false;

  _bledroidCrashDeferred: ?Deferred<void> = null;

  _socketScanner: ?SocketScanner = null;
  _sessionInfoMap: Map<number, SessionInfo> = new Map();
  _nextSocketSessionId: number = 0;

  constructor() {
    log.debug(`constructor`);
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
    } catch(error) {
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
    log.warn(`Noble warning:`, message);
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

    case `pauseScan`: {
      this._onPauseScan(message.promiseId);
      break;
    }

    case `resumeScan`: {
      this._onResumeScan(message.promiseId);
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
      this._beaconInfo = Object.assign({
        uuid: ``,
        major: 0,
        minor: 0,
        measuredPower: this._defaultBeaconPower,
      }, beaconInfo);
    } else {
      this._beaconInfo = null;
    }
  }

  _onMode(mode: BluetoothMode, promiseId: number): Promise<void> {
    log.debug(`_onMode`, mode, promiseId);

    switch (mode) {
    case BluetoothLE.MODE_OFF:
      break;

    case BluetoothLE.MODE_SCAN:
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
            } catch(err) {
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

  _onPauseScan(promiseId: number): Promise<void> {
    log.debug(`_onPauseScan`, promiseId);

    invariant(this._mode === BluetoothLE.MODE_SCAN);
    invariant(this._socketScanner);

    return this._socketScanner.pause()
      .then(() => {
        this._sendMessage({
          name: `pauseScan`,
          promiseId,
        });
      })
      .catch((error) => {
        this._sendMessage({
          name: `pauseScan`,
          promiseId,
          error: {
            message: error.message,
            stack: error.stack,
          },
        });
        throw error;
      });
  }

  _onResumeScan(promiseId: number): Promise<void> {
    log.debug(`_onResumeScan`, promiseId);

    invariant(this._mode === BluetoothLE.MODE_SCAN);
    invariant(this._socketScanner);

    return this._socketScanner.resume()
      .then(() => {
        this._sendMessage({
          name: `resumeScan`,
          promiseId,
        });
      })
      .catch((error) => {
        this._sendMessage({
          name: `resumeScan`,
          promiseId,
          error: {
            message: error.message,
            stack: error.stack,
          },
        });
        throw error;
      });
  }

  async _changeMode(mode: BluetoothMode): Promise<void> {
    log.debug(`_changeMode`, mode);

    if (this._mode === mode) {
      return;
    }

    await this._off();

    if (mode !== BluetoothLE.MODE_OFF) {
      invariant(this._beaconInfo);

      await this._startAdvertising();

      if (mode === BluetoothLE.MODE_SCAN) {
        await this._startSocketScanner();
      }
    }

    this._mode = mode;
  }

  async _off(): Promise<void> {
    log.debug(`_off`);

    let promises = [];

    if (this._sessionInfoMap.size) {
      log.info(`Waiting for ${this._sessionInfoMap.size} socket sessions to ` +
               `close`);
      this._sessionInfoMap.forEach((sessionInfo) => {
        promises.push(new Promise((resolve) => {
          const socketSession = sessionInfo.session;
          socketSession.once(`close`, resolve);
          socketSession.end();
        }));
      });
    }

    let socketScanner = this._socketScanner;
    if (socketScanner) {
      log.info(`Waiting for socket scanner to stop`);
      promises.push(socketScanner.stop());
      socketScanner.removeListener(`discover`, this._onDiscover);
    }

    if (this._advertising && this._adapterState === `poweredOn`) {
      log.info(`Waiting for advertising to stop`);

      invariant(!this._bledroidCrashDeferred);
      this._bledroidCrashDeferred = createDeferred();

      let promise = new Promise(resolve => {
        bleno.stopAdvertising(() => resolve());
      });

      promises.push(Promise.race([
        this._bledroidCrashDeferred.promise,
        promise,
      ]));
    }

    if (promises.length) {
      await Promise.all(promises);
      log.info(`Done waiting`);
    }

    this._sessionInfoMap.clear();
    this._socketScanner = null;
    this._advertising = false;
    this._bledroidCrashDeferred = null;
  }

  async _startAdvertising(): Promise<void> {
    log.debug(`_startAdvertising`);

    if (this._advertising) {
      return;
    }

    // Make sure that the adapter is on before attempting to start advertising.
    await this._adapterStateDeferred.promise;

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = createDeferred();

    let promise = new Promise((resolve, reject) => {
      const callback = error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      invariant(this._beaconInfo);
      bleno.startAdvertisingIBeacon(this._beaconInfo.uuid,
                                    this._beaconInfo.major,
                                    this._beaconInfo.minor,
                                    this._beaconInfo.measuredPower,
                                    callback);
    });

    await Promise.race([
      this._bledroidCrashDeferred.promise,
      promise,
    ]);

    this._advertising = true;
    this._bledroidCrashDeferred = null;
  }

  async _startSocketScanner(): Promise<void> {
    log.debug(`_startSocketScanner`);

    if (this._socketScanner) {
      return;
    }

    // Make sure that the adapter is on before attempting to start scanning.
    await this._adapterStateDeferred.promise;

    const scanner = new SocketScanner(
      noble,
      this._privateKey,
      {
        publicKeys: this._publicKeys,
        serviceUuid: this._beaconInfo ? this._beaconInfo.uuid : ``,
      }
    );

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = createDeferred();

    await Promise.race([
      this._bledroidCrashDeferred.promise,
      scanner.start(),
    ]);

    scanner.addListener(`discover`, this._onDiscover);

    this._socketScanner = scanner;
    this._bledroidCrashDeferred = null;
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
        this._sessionInfoMap.clear();
      }
      if (this._socketScanner) {
        this._socketScanner.stop();
        this._socketScanner = null;
      }
      this._advertising = false;

      this._mode = BluetoothLE.MODE_OFF;
    } catch(error) {
      // Ensure that our state is correct even if something above failed.
      this._sessionInfoMap.clear();
      this._socketScanner = null;
      this._advertising = false;
      this._mode = BluetoothLE.MODE_OFF;

      log.warn(error);
    }
  };

  _onDiscover: ((peripheral: Peripheral) => void) = (peripheral) => {
    log.debug(`_onDiscover`, peripheral.uuid);

    invariant(peripheral.state === `connected`);
    invariant(this._socketScanner);

    const id = this._nextSocketSessionId++;
    if (id === 0xffffffff) {
      log.warn(`Exceeded max socket session ids, wrapping around`);
      this._nextSocketSessionId = 0;
    }

    const session = new ChildSocketSession(this._socketScanner, peripheral);
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

    case `scan`: {
      if (message.enabled) {
        session.startScanning();
      } else {
        session.stopScanning();
      }
      break;
    }

    case `skip`: {
      if (message.enabled) {
        session.skip();
      } else {
        session.unskip();
      }
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
