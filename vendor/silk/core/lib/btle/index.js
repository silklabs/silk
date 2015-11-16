/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import bleno from 'bleno';
import EventEmitter from 'events';
import { getboolprop } from '../sysutils';
import getDeviceId from '../deviceid';
import makeDeferred from '../deferred';
import makeLog from '../log';
import noble from 'noble';
import SocketScanner from './socket_scanner';

const DEFAULT_BEACON_MAJOR = 0;
const DEFAULT_BEACON_MINOR = 0;

const log = makeLog(`btle`);

let initPromise;
let initPromiseComplete;

class BluetoothLE extends EventEmitter {
  // TODO: This needs to be measured and customized for each type of device we
  //       ship.
  // This is the transmit power measured against a Nexus 4 at 1 meter distance.
  static DEFAULT_BEACON_POWER = -60;

  static MODE_OFF = `off`;
  static MODE_SCAN = `scan`;
  static MODE_BEACON = `beacon`;

  _beaconInfo = null;
  _mode = BluetoothLE.MODE_OFF;
  _desiredMode = BluetoothLE.MODE_OFF;
  _advertising = false;
  _changeStatePromise = Promise.resolve();
  _adapterState = ``;

  _adapterStateDeferred = makeDeferred();
  _adapterStateDeferredAccepted = false;

  _bledroidCrashDeferred = null;

  _socketScanner = null;
  _socketSession = null;
  _socketSessionListener = null;

  _privateKey = ``;
  _publicKeys = [ ];

  constructor(privateKey) {
    log.debug(`BluetoothLE()`)  ;

    assert(privateKey);

    super();

    this.MODE_OFF = BluetoothLE.MODE_OFF;
    this.MODE_SCAN = BluetoothLE.MODE_SCAN;
    this.MODE_BEACON = BluetoothLE.MODE_BEACON;

    this._privateKey = privateKey;

    assert(bleno.state === noble.state);
    this._adapterState = noble.state;

    if (noble.state === `poweredOn`) {
      this._adapterStateDeferred.accept();
      this._adapterStateDeferredAccepted = true;
    }

    noble.addListener(`stateChange`, this._onAdapterStateChange);
  }

  get mode() {
    return this._mode;
  }

  set publicKeys(val) {
    assert(val === null || Array.isArray(val));

    if (val) {
      for (let publicKey of val) {
        assert(typeof publicKey === `string`);
      }
    } else {
      val = [ ];
    }

    this._publicKeys = val;
  }

  get beaconInfo() {
    return Object.assign({ }, this._beaconInfo);
  }

  set beaconInfo(value) {
    if (this._mode !== BluetoothLE.MODE_OFF) {
      throw new Error(`Must be 'off' before changing beacon info`);
    }

    let info = {
      major: DEFAULT_BEACON_MAJOR,
      minor: DEFAULT_BEACON_MINOR,
      measuredPower: BluetoothLE.DEFAULT_BEACON_POWER,
    };

    if (typeof value === 'string') {
      info.uuid = value;
    } else {
      info = Object.assign(info, value);

      if (!info.uuid) {
        throw new Error(`Must have a uuid`);
      }
    }

    this._beaconInfo = info;
  }

  get socketSessionListener() {
    return this._socketSessionListener;
  }

  set socketSessionListener(val) {
    if (this._mode !== BluetoothLE.MODE_OFF) {
      throw new Error(`Must be 'off' before changing socket listener`);
    }

    this._socketSessionListener = val;
  }

  async changeMode(mode) {
    log.debug(`BluetoothLE.changeMode('${mode}')`);

    switch (mode) {
    case BluetoothLE.MODE_OFF:
      break;

    case BluetoothLE.MODE_SCAN:
    case BluetoothLE.MODE_BEACON:
      assert(this._beaconInfo);
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

  async _changeMode(mode) {
    log.debug(`BluetoothLE._changeMode('${mode}')`);

    if (this._mode === mode) {
      return;
    }

    await this._off();

    if (mode !== BluetoothLE.MODE_OFF) {
      assert(this._beaconInfo);

      await this._startAdvertising();

      if (mode === BluetoothLE.MODE_SCAN) {
        await this._startSocketScanner();
      }
    }

    this._mode = mode;
    this.emit(`modeChanged`, mode);
  }

  async _off() {
    log.debug(`BluetoothLE._off()`);

    let promises = [ ];

    if (this._socketSession) {
      log.info(`Waiting for socket session to disconnect`);
      promises.push(new Promise(resolve => {
        this._socketSession.once(`close`, () => resolve());
        this._socketSession.end();
      }));
    }

    if (this._socketScanner) {
      log.info(`Waiting for socket scanner to stop`);
      this._socketScanner.removeListener(`connect`,
                                         this._onSocketSessionConnect);
      promises.push(this._socketScanner.stop());
    }

    if (this._advertising && this._adapterState === `poweredOn`) {
      log.info(`Waiting for advertising to stop`);

      assert(!this._bledroidCrashDeferred);
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

  async _startAdvertising() {
    log.debug(`BluetoothLE._startAdvertising()`);

    if (this._advertising) {
      return;
    }

    // Make sure that the adapter is on before attempting to start advertising.
    await this._adapterStateDeferred.promise;

    assert(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = makeDeferred();

    let promise = new Promise((resolve, reject) => {
      const callback = error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
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

  async _startSocketScanner() {
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
        serviceUuid: this._beaconInfo.uuid,
      }
    );

    assert(!this._bledroidCrashDeferred);
    this._bledroidCrashDeferred = makeDeferred();

    await Promise.race([
      this._bledroidCrashDeferred.promise,
      scanner.start(),
    ]);

    scanner.addListener(`connect`, this._onSocketSessionConnect);

    this._socketScanner = scanner;
    this._bledroidCrashDeferred = null;
  }

  _onAdapterStateChange = adapterState => {
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
      assert(!this._bledroidCrashDeferred);

      // Make sure that we unblock anyone waiting on the adapter state promise.
      if (!this._adapterStateDeferredAccepted) {
        this._adapterStateDeferred.accept();
        this._adapterStateDeferredAccepted = true;
      }
      return;
    }

    if (!justCrashed) {
      assert(!this._adapterStateDeferredAccepted);
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

  _onSocketSessionConnect = socketSession => {
    log.debug(`BluetoothLE._onSocketSessionConnect()`);

    // This won't be true always, but right now we only support one connection
    // at a time.
    assert(!this._socketSession);

    const listener = this._socketSessionListener;
    assert(listener);

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

async function init() {
  assert(!initPromiseComplete);

  const stateChange = `stateChange`;
  const expectedState = getboolprop(`ro.silk.bt.enabled`, true) ?
                        `poweredOn` :
                        `poweredOff`;

  function waitForState(api, apiName) {
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

  let [ deviceId ] = await Promise.all([
    getDeviceId(),
    waitForState(bleno, `bleno`),
    waitForState(noble, `noble`),
  ]);

  assert(deviceId);

  let instance = new BluetoothLE(deviceId.priv);

  initPromiseComplete = true;

  log.info(`Initialization complete`);

  return instance;
}

export default async function() {
  if (initPromise) {
    log.debug(`Already initializ` + (initPromiseComplete ? `ed` : `ing`));
  } else {
    initPromise = init();
  }
  return await initPromise;
}
