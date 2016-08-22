/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

// Set up error handling before doing anything else.
let parentConnected = true;

import jsErrors from '../js_errors';
jsErrors(null);
process.on('exit', (code) => {
  if (process.send && parentConnected) {
    try {
      process.send({
        name: `error`,
        message: `Process exit code: ${code}`,
      });
    } catch (exception) {
      console.error(exception.stack);          // eslint-disable-line no-console
    }
  }
});

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

import type {AdvertisingInfo, BluetoothMode} from './parent';
import type SocketStream from './socket_stream';

type SessionInfo = {
  id: number;
  session: ChildSocketSession;
  socket: InternalMessageFilterStream;
};

const log = createLog(`btle-child`);

const MANUFACTURER_DATA_VERSION = 1;

class BluetoothLEChild {

  // State that comes from the parent process.
  _privateKey: string = ``;
  _serverPath: string = ``;
  _mode: BluetoothMode = BluetoothLE.MODE_OFF;
  _publicKeys: Array<string> = [];
  _manufacturerCode: number = 0;
  _deviceType: number = 0;
  _beaconPower: number = -100;
  _advertisingInfo: ?AdvertisingInfo = null;

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

    case `advertisingInfo`: {
      this._onAdvertisingInfo(message.advertisingInfo);
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

  _waitForAdapter(): Promise<void> {
    if (!this._adapterStateDeferredAccepted) {
      log.info(`Waiting for adapter state to be 'poweredOn'`);
    }
    return this._adapterStateDeferred.promise;
  }

  async _onInitialize(message: Object) {
    log.debug(`_onInitialize`, message);

    invariant(this._mode === BluetoothLE.MODE_OFF);

    this._privateKey = message.privateKey;
    this._serverPath = message.serverPath;
    this._manufacturerCode = message.manufacturerCode;
    this._deviceType = message.deviceType;
    this._beaconPower = message.beaconPower;

    this._onPublicKeys(message.publicKeys);
    this._onAdvertisingInfo(message.advertisingInfo || null);

    this._desiredMode = message.mode;

    await this._waitForAdapter();

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

  _onAdvertisingInfo(advertisingInfo: ?AdvertisingInfo): void {
    log.debug(`_onAdvertisingInfo`, advertisingInfo);

    invariant(this._mode === BluetoothLE.MODE_OFF);

    this._advertisingInfo = advertisingInfo;
  }

  _onMode(mode: BluetoothMode, promiseId: ?number): Promise<void> {
    log.debug(`_onMode`, mode, promiseId);

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
              if (promiseId !== null) {
                this._sendMessage({
                  name: `mode`,
                  mode,
                  promiseId,
                });
              }
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
          if (promiseId !== null) {
            this._sendMessage({
              name: `mode`,
              mode,
              promiseId,
              error: {
                message: error.message,
                stack: error.stack,
              },
            });
          }
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
      invariant(this._advertisingInfo);

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
        sessionPromises.push(new Promise((resolve) => {
          const socketSession = sessionInfo.session;
          socketSession.once(`close`, resolve);
          socketSession.end();
        }));
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
        this._bledroid.once(`beaconStop`, (status) => {
          if (status) {
            log.warn(`Failed to stop beacon, status = ${status}`);
          }
          resolve();
        });
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

    await this._waitForAdapter();

    if (this._socketService) {
      return;
    }

    const bledroidCrash = createDeferred();

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = bledroidCrash;

    invariant(this._advertisingInfo);
    const service = new SocketService(noble, bleno, this._advertisingInfo.uuid);

    const promise = new Promise((resolve, reject) => {
      log.debug(`Setting services`);
      const callback = error => error ? reject(error) : resolve();
      bleno.setServices([service], callback);
    }).then(() => {
      log.debug(`Starting advertising`);

      const advertisingInfo = this._advertisingInfo;
      invariant(advertisingInfo);

      const data = Buffer.allocUnsafe(7);
      let index = 0;

      // Manufacturer code.
      data.writeUInt16LE(this._manufacturerCode, index);
      index += 2;

      // Manufacturer data version.
      data.writeUInt8(MANUFACTURER_DATA_VERSION, index);
      index += 1;

      // Device type.
      data.writeUInt16LE(this._deviceType, index);
      index += 2;

      // Device id.
      data.writeUInt16LE(advertisingInfo.id, index);
      index += 2;

      invariant(index === data.length);

      const command = [
        `startAdvertising`,
        `0`, // include_name
        `0`, // include_txpower
        `0`, // appearance
        data.length,
        data.toString('hex'),
        `0`, // service_data_len
        `1`, // service_uuid_len
        service.uuid,
      ].join(` `);

      return new Promise((resolve, reject) => {
        this._bledroid.once(`advertisingStart`, (status) => {
          if (status) {
            const message = `Failed to start advertising, status ${status}`;
            reject(new Error(message));
          } else {
            resolve();
          }
        });
        this._bledroid.command(command);
      });
    });

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

    await this._waitForAdapter();

    if (this._beaconActive) {
      return;
    }

    const advertisingInfo = this._advertisingInfo;
    invariant(advertisingInfo);

    const beaconUuid =
      advertisingInfo.uuid.toLowerCase().replace(/[^\da-f]/g, ``);
    invariant(beaconUuid);
    invariant(beaconUuid.length === 32, `Invalid uuid '${beaconUuid}'`);

    // iBeacon data is always 25 bytes long.
    const data = Buffer.allocUnsafe(25);
    let index = 0;

    // Apple company identifier
    data.writeUInt16LE(0x4c, index);
    index += 2;

    // iBeacon tag.
    data.writeUInt8(0x02, index);
    index += 1;

    // Size of the iBeacon data.
    data.writeUInt8(0x15, index);
    index += 1;

    // iBeacon uuid.
    data.write(beaconUuid, index, 16, 'hex');
    index += 16;

    // iBeacon major.
    data.writeUInt16BE(this._deviceType, index);
    index += 2;

    // iBeacon minor.
    data.writeUInt16BE(advertisingInfo.id, index);
    index += 2;

    // iBeacon measured power.
    data.writeInt8(this._beaconPower, index);
    index += 1;

    invariant(index === data.length);

    const bledroidCrash = createDeferred();

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = bledroidCrash;

    const promise = new Promise((resolve) => {
      this._bledroid.once(`beaconStart`, (status) => {
        if (status) {
          log.warn(`Failed to start beacon, status ${status}`);
        }
        resolve();
      });
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
      this._bledroid.once(`beaconStop`, (status) => {
        if (status) {
          log.warn(`Failed to stop beacon, status = ${status}`);
        }
        resolve();
      });
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

  _onAdapterStateChange: ((state: AdapterState) => void) = (state) => {
    log.debug(`_onAdapterStateChange`, state);

    if (this._adapterState === state) {
      return;
    }

    const justCrashed = this._adapterState === 'poweredOn';
    if (justCrashed) {
      log.warn(`Bledroid crashed`);

      // XXX Fix
      //api.metrics.add(new Metrics.BledroidCrash());
    }

    log.info(`Adapter state changed to '${state}'`);
    this._adapterState = state;

    if (state === 'poweredOn') {
      invariant(!this._bledroidCrashDeferred);

      // Make sure that we unblock anyone waiting on the adapter state promise.
      if (!this._adapterStateDeferredAccepted) {
        this._adapterStateDeferredAccepted = true;
        this._adapterStateDeferred.accept();
      }
      return;
    }

    if (!justCrashed) {
      invariant(!this._adapterStateDeferredAccepted);
      return;
    }

    // Remove any bledroid listeners that may have been added before the crash.
    this._bledroid.removeAllListeners();

    // Make sure that any mode changes wait for bledroid to reconnect.
    if (this._adapterStateDeferredAccepted) {
      this._adapterStateDeferred = createDeferred();
      this._adapterStateDeferredAccepted = false;
    }

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
      this._onMode(this._desiredMode, null);
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
    }

    // Ensure that our state is correct even if something above failed.
    this._sessionInfoMap.clear();
    this._socketService = null;
    this._beaconActive = false;
    this._mode = BluetoothLE.MODE_OFF;
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

    const sessionErrorListener = (error) => {
      log.error(`Session error`, error);
      socket.end();
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

      session.removeListener(`error`, sessionErrorListener);

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

    session.addListener(`error`, sessionErrorListener);

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
      const [error] = args;
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
      const [publicKey] = args;
      invariant(publicKey);
      socket.writeInternal(createInternalMessage({
        name: `authenticated`,
        authenticatedPublicKey: publicKey,
      }));
      break;
    }

    case `unauthenticated`: {
      socket.writeInternal(createInternalMessage({
        name: `authenticated`,
        authenticatedPublicKey: ``,
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
