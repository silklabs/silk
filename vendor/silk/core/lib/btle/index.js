/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import bleno from 'bleno';
import EventEmitter from 'events';
import { getboolprop } from '../sysutils';
import makeDeferred from '../deferred';
import makeLog from '../log';
import noble from 'noble';
import SocketScanner from './socket_scanner';

/**
 * Config Service
 *
 * BLE Roles
 *   - Device is the "Peripheral" and is advertising a service
 *   - App is the "Central" and is listening for advertisements
 *
 * We are using the GATT profile to send data between the Device and App
 *   - Device is the GATT server, offering ability to read/write Characteristics
 *   - App is the GATT client, doing reads/write on the device.
 *
 * Config Process
 *   1) Device advertises service
 *   2) Device waits for connection from App
 *   3) After connection, Device keeps RSSI (GATT Characteristic) up-to-date
 *   4) App polls and read the RSSI until above a min threshold
 *   5) App writes the Wi-Fi access point and secret key (GATT Characteristics)
 *   6) BLE Config Service updates state to configured
 *   7) Config connects to new Wi-Fi network received from BLE Config Service
 */

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
  _advertising = false;
  _changeStatePromise = Promise.resolve();
  _adapterState = ``;
  _modeAtReset = BluetoothLE.MODE_OFF;
  _adapterStateResolve = null;

  _socketScanner = null;
  _socketSession = null;
  _socketSessionListener = null;

  constructor() {
    log.debug(`BluetoothLE()`)  ;

    super();

    this.MODE_OFF = BluetoothLE.MODE_OFF;
    this.MODE_SCAN = BluetoothLE.MODE_SCAN;
    this.MODE_BEACON = BluetoothLE.MODE_BEACON;

    assert(bleno.state === noble.state);
    this._adapterState = noble.state;

    noble.addListener(`stateChange`, this._onAdapterStateChange);
  }

  get mode() {
    return this._mode;
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
    this._modeAtReset = mode;

    try {
      await this._changeStatePromise;
    } catch(error) {                             // eslint-disable-line no-empty
      // Any error should have been logged by now.
    }

    this._changeStatePromise = this._changeMode(mode);
    await this._changeStatePromise;
  }

  async _changeMode(mode) {
    log.debug(`BluetoothLE._changeMode('${mode}')`);

    if (this._mode === mode) {
      return;
    }

    this.emit(`modeChanging`, this._mode, mode);

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
      log.debug(`Disconnecting socket session`);
      this._socketSession.disconnect();
      this._socketSession = null;
    }

    if (this._socketScanner) {
      log.info(`Waiting for socket scanner to stop`);
      this._socketScanner.removeListener(`connect`,
                                         this._onSocketSessionConnect);
      promises.push(this._socketScanner.stop());
    }

    if (this._advertising && this._adapterState === `poweredOn`) {
      log.info(`Waiting for advertising to stop`);
      promises.push(new Promise(resolve => {
        bleno.stopAdvertising(() => {
          resolve();
        });
      }));
    }

    if (promises.length) {
      await Promise.all(promises);
      log.info(`Done waiting`);
    }

    this._socketScanner = null;
    this._advertising = false;
  }

  async _startAdvertising() {
    log.debug(`BluetoothLE._startAdvertising()`);

    if (this._advertising) {
      return;
    }

    if (this._adapterState !== `poweredOn`) {
      log.warn(`Ignoring _startAdvertising() because adapter state is ` +
               `'${this._adapterState}'`);
      return;
    }

    await new Promise((resolve, reject) => {
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

    this._advertising = true;
  }

  async _startSocketScanner() {
    log.debug(`BluetoothLE._startSocketScanner()`);

    if (this._socketScanner) {
      return;
    }

    if (this._adapterState !== `poweredOn`) {
      log.warn(`Ignoring _startSocket() because adapter state is ` +
               `'${this._adapterState}'`);
      return;
    }

    const scanner =
      new SocketScanner(noble, { serviceUuid: this._beaconInfo.uuid });
    await scanner.start();

    scanner.addListener(`connect`, this._onSocketSessionConnect);

    this._socketScanner = scanner;
  }

  _onAdapterStateChange = adapterState => {
    log.debug(`BluetoothLE._onAdapterStateChange('${adapterState}')`);

    if (this._adapterState === adapterState) {
      return;
    }

    log.info(`Adapter state changed to '${adapterState}'`);
    this._adapterState = adapterState;

    if (adapterState === `poweredOn`) {
      const modeAtReset = this._modeAtReset;
      this._modeAtReset = BluetoothLE.MODE_OFF;

      this._changeStatePromise =
        this._changeStatePromise
          .catch(error => undefined)                      // eslint-disable-line
          .then(() => this._changeMode(modeAtReset))
          .catch(error => log.warn(error));

      if (this._adapterStateResolve) {
        this._adapterStateResolve();
        this._adapterStateResolve = null;
      }

      return;
    }

    if (this._adapterStateResolve) {
      return;
    }

    // Make futher calls to changeState() wait for the power to come back on.
    let deferred = makeDeferred();

    this._changeStatePromise =
      this._changeStatePromise
        .catch(error => undefined)                        // eslint-disable-line
        .then(() => this._changeMode(BluetoothLE.MODE_OFF))
        .then(() => {
          assert(this._mode === BluetoothLE.MODE_OFF);
          assert(!this._advertising);
          assert(!this._configService);
          assert(!this._socketScanner);
          return deferred.promise;
        })
        .catch(error => log.warn(error));
    this._adapterStateResolve = deferred.accept;
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

  await Promise.all([
    waitForState(bleno, `bleno`),
    waitForState(noble, `noble`),
  ]);

  let instance = new BluetoothLE();

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
