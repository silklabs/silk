/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import bleno from 'bleno';
import { EventEmitter } from 'events';
import { getboolprop } from '../sysutils';
import getDeviceId from '../deviceid';
import makeDeferred from '../deferred';
import makeLog from '../log';
import noble from 'noble';
import SocketScanner from './socket_scanner';

import type SocketSession from './socket_session';
import type { Deferred } from '../deferred';

type BluetoothMode = 'off' | 'scan' | 'beacon';
type BeaconInfo = {
  major: number;
  minor: number;
  measuredPower: number;
  uuid: string;
};

const DEFAULT_BEACON_MAJOR = 0;
const DEFAULT_BEACON_MINOR = 0;

const log = makeLog(`btle`);

class BluetoothLE extends EventEmitter {
  // TODO: This needs to be measured and customized for each type of device we
  //       ship.
  // This is the transmit power measured against a Nexus 4 at 1 meter distance.
  static DEFAULT_BEACON_POWER: number = -60;

  static MODE_OFF: string = `off`;
  static MODE_SCAN: string = `scan`;
  static MODE_BEACON: string = `beacon`;

  MODE_OFF: string = BluetoothLE.MODE_OFF;
  MODE_SCAN: string = BluetoothLE.MODE_SCAN;
  MODE_BEACON: string = BluetoothLE.MODE_BEACON;

  _beaconInfo: ?BeaconInfo = null;
  _mode: BluetoothMode = BluetoothLE.MODE_OFF;
  _desiredMode: BluetoothMode = BluetoothLE.MODE_OFF;
  _advertising: boolean = false;
  _changeStatePromise: Promise<void> = Promise.resolve();
  _adapterState: string; // TODO enum?

  _adapterStateDeferred: Deferred<void> = makeDeferred();
  _adapterStateDeferredAccepted: boolean = false;

  _bledroidCrashDeferred: ?Deferred<void> = null;

  _socketScanner: ?SocketScanner = null;
  _socketSession: ?SocketSession = null;
  _socketSessionListener: ?EventEmitter = null;

  _privateKey: string;
  _publicKeys: Array<string> = [];

  constructor(privateKey: string) {
    log.debug(`BluetoothLE()`)  ;

    invariant(privateKey);

    super();

    this._privateKey = privateKey;

    invariant(bleno.state === noble.state);
    this._adapterState = noble.state;

    if (noble.state === `poweredOn`) {
      this._adapterStateDeferred.accept();
      this._adapterStateDeferredAccepted = true;
    }

    noble.addListener(`stateChange`, this._onAdapterStateChange);
  }

  get mode(): BluetoothMode {
    return this._mode;
  }

  set publicKeys(val: ?Array<string>) {
    invariant(val === null || Array.isArray(val));

    val = val || [];
    val.forEach((publicKey) => invariant(typeof publicKey === `string`));

    this._publicKeys = val;
  }

  get beaconInfo(): BeaconInfo {
    return Object.assign({ }, this._beaconInfo);
  }

  set beaconInfo(value: BeaconInfo) {
    if (this._mode !== BluetoothLE.MODE_OFF) {
      throw new Error(`Must be 'off' before changing beacon info`);
    }

    let info: BeaconInfo = {
      major: DEFAULT_BEACON_MAJOR,
      minor: DEFAULT_BEACON_MINOR,
      measuredPower: BluetoothLE.DEFAULT_BEACON_POWER,
      uuid: '',
    };

    info = Object.assign(info, value);
    if (!info.uuid) {
      throw new Error(`Must have a uuid`);
    }

    this._beaconInfo = info;
  }

  get socketSessionListener(): ?EventEmitter {
    return this._socketSessionListener;
  }

  set socketSessionListener(val: ?EventEmitter) {
    if (this._mode !== BluetoothLE.MODE_OFF) {
      throw new Error(`Must be 'off' before changing socket listener`);
    }

    this._socketSessionListener = val;
  }

  async changeMode(mode: BluetoothMode): Promise<void> {
    log.debug(`BluetoothLE.changeMode('${mode}')`);

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
          let failureCount = 0;
          for ( ; ; ) {
            try {
              await this._changeMode(mode);
              return;
            } catch(error) {
              if (++failureCount === 3) {
                log.warn(`Unable to change mode to '${mode}' after ` +
                         `${failureCount} attempts`,
                         error);
                throw error;
              }
              log.warn(`Failed to change mode to '${mode}', retrying`, error);
            }
          }
        });
    await this._changeStatePromise;
  }

  async _changeMode(mode: BluetoothMode): Promise<void> {
    log.debug(`BluetoothLE._changeMode('${mode}')`);

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
    this.emit(`modeChanged`, mode);
  }

  async _off(): Promise<void> {
    log.debug(`BluetoothLE._off()`);

    let promises = [ ];

    if (this._socketSession) {
      log.info(`Waiting for socket session to disconnect`);
      promises.push(new Promise(resolve => {
        let socketSession = this._socketSession;
        invariant(socketSession);
        socketSession.once(`close`, () => resolve());
        socketSession.end();
      }));
    }

    let socketScanner = this._socketScanner;
    if (socketScanner) {
      log.info(`Waiting for socket scanner to stop`);
      socketScanner.removeListener(`connect`, this._onSocketSessionConnect);
      promises.push(socketScanner.stop());
    }

    if (this._advertising && this._adapterState === `poweredOn`) {
      log.info(`Waiting for advertising to stop`);

      invariant(!this._bledroidCrashDeferred);
      this._bledroidCrashDeferred = makeDeferred();

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

    this._socketSession = null;
    this._socketScanner = null;
    this._advertising = false;
    this._bledroidCrashDeferred = null;
  }

  async _startAdvertising(): Promise<void> {
    log.debug(`BluetoothLE._startAdvertising()`);

    if (this._advertising) {
      return;
    }

    // Make sure that the adapter is on before attempting to start advertising.
    await this._adapterStateDeferred.promise;

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = makeDeferred();

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
    log.debug(`BluetoothLE._startSocketScanner()`);

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
        serviceUuid: this._beaconInfo ? this._beaconInfo.uuid : '',
      }
    );

    invariant(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = makeDeferred();

    await Promise.race([
      this._bledroidCrashDeferred.promise,
      scanner.start(),
    ]);

    scanner.addListener(`connect`, this._onSocketSessionConnect);

    this._socketScanner = scanner;
    this._bledroidCrashDeferred = null;
  }

  _onAdapterStateChange: ((adapterState: string) => void) = (adapterState) => {
    log.debug(`BluetoothLE._onAdapterStateChange('${adapterState}')`);

    if (this._adapterState === adapterState) {
      return;
    }

    const justCrashed = this._adapterState === `poweredOn`;
    if (justCrashed) {
      log.warn(`Bledroid crashed`);
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
    this._adapterStateDeferred = makeDeferred();
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
      this.changeMode(this._desiredMode);
    }

    // Pretend like we're just changing to OFF.
    try {
      if (this._socketSession) {
        this._socketSession.end();
        this._socketSession = null;
      }
      if (this._socketScanner) {
        this._socketScanner.stop();
        this._socketScanner = null;
      }
      this._advertising = false;

      this._mode = BluetoothLE.MODE_OFF;
      this.emit(`modeChanged`, BluetoothLE.MODE_OFF);
    } catch(error) {
      // Ensure that our state is correct even if something above failed.
      this._socketSession = null;
      this._socketScanner = null;
      this._advertising = false;
      this._mode = BluetoothLE.MODE_OFF;

      log.warn(error);
    }
  };

  _onSocketSessionConnect: ((socketSession: SocketSession) => void) = (socketSession) => {
    log.debug(`BluetoothLE._onSocketSessionConnect()`);

    // This won't be true always, but right now we only support one connection
    // at a time.
    invariant(!this._socketSession);

    const listener = this._socketSessionListener;
    invariant(listener);

    socketSession.once(`close`, () => {
      listener.emit(`disconnect`, socketSession);

      if (this._socketSession === socketSession) {
        this._socketSession = null;
      }
    });

    this._socketSession = socketSession;
    listener.emit(`connect`, socketSession);
  };
}

// TODO: remove 'any' once
// https://github.com/facebook/flow/issues/1170 is resolved
let initPromise: ?Promise<any> = null;
let initPromiseComplete = false;

// TODO: remove 'any'
async function init(): Promise<any> {
  invariant(!initPromiseComplete);

  const stateChange = `stateChange`;
  const expectedState = getboolprop(`ro.silk.bt.enabled`, true) ?
                        `poweredOn` :
                        `poweredOff`;

  function waitForState(api: any, apiName: string): Promise<void> {
    return new Promise(resolve => {
      if (api.state === expectedState) {
        log.debug(`${apiName} is already '${expectedState}'`);
        resolve();
        return;
      }
      log.debug(`${apiName} waiting for '${expectedState}'`);
      api.addListener(stateChange, function listener(state) {
        log.debug(`${apiName} '${stateChange}': '${state}'`);
        if (state === expectedState) {
          api.removeListener(stateChange, listener);
          resolve();
        }
      });
    });
  }

  log.info(`Initializing`);

  noble.on(`warning`, message => {
    log.warn(message);
  });

  let deviceId;
  await Promise.all([
    // We can't just `await getDeviceId()` and use the return value
    // because Flow doesn't like bunching up promises of different
    // return types in Promise.all().
    getDeviceId().then((id) => deviceId = id),
    waitForState(bleno, `bleno`),
    waitForState(noble, `noble`),
  ]);

  invariant(deviceId);
  // TODO: remove 'any'
  let instance: any = new BluetoothLE(deviceId.priv);
  initPromiseComplete = true;
  log.info(`Initialization complete`);
  return instance;
}

// TODO: remove 'any'
export default function(): Promise<any> {
  if (initPromise) {
    log.debug(`Already initializ` + (initPromiseComplete ? `ed` : `ing`));
  } else {
    initPromise = init();
  }
  return initPromise;
}
