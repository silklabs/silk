/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import bleno from 'bleno';
import ConfigService from './config-service';
import caps from '../caps';
import EventEmitter from 'events';
import getDeviceId from '../deviceid';
import makeLog from '../log';
import noble from 'noble';
import Ranger from './ranger';

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

const MODE_OFF = 'off';
const MODE_CONFIGURE = 'configure';
const MODE_NORMAL = 'normal';

const ADVERTISING_OFF = 0;
const ADVERTISING_BEACON = 1;
const ADVERTISING_CONFIG = 2;

// TODO: Pull from silk-api
const DEFAULT_BEACON_UUID = 'e0f3a744-fb2f-46f1-b45a-f2b398f2a424';

// TODO: This needs to be measured and customized for each type of device we
//       ship.
// This is the transmit power measured against a Nexus 4 at 1 meter distance.
const DEFAULT_BEACON_POWER = -60;

const log = makeLog('btle');

let initPromise;
let initPromiseComplete;

class BluetoothLE extends EventEmitter {
  _deviceId = ''
  _beaconInfo = null
  _mode = MODE_OFF
  _changeStatePromise = Promise.resolve()
  _adapterState = ''
  _advertisingMode = ADVERTISING_OFF
  _configState = ConfigService.STATE_UNREGISTERED
  _services = [ ]
  _configuringDeviceAddress = null
  _updateRssiTimeout = null

  _configService = null
  _ranger = null

  constructor(deviceId, beaconInfo) {
    super();

    log.debug(`BluetoothLE('${deviceId}', '${JSON.stringify(beaconInfo)}')`);

    this._deviceId = deviceId;

    if (beaconInfo) {
      this._beaconInfo = beaconInfo;
    } else {
      this._beaconInfo = {
        uuid: DEFAULT_BEACON_UUID,
        major: 0,
        minor: 0,
        measuredPower: DEFAULT_BEACON_POWER,
      };
    }

    assert(bleno.state === noble.state);
    this._adapterState = bleno.state;

    noble.on('stateChange', state => this._onAdapterStateChange(state));
  }

  get deviceId() {
    return this._deviceId;
  }

  get mode() {
    return this._mode;
  }

  get configService() {
    return this._configService;
  }

  get ranger() {
    return this._ranger;
  }

  get beaconUuid() {
    return this._beaconInfo.uuid;
  }

  async resetBeaconUuid() {
    log.debug('resetBeaconUuid()');

    await this._changeStatePromise;

    this._changeStatePromise =
      this._changeBeaconUuid(DEFAULT_BEACON_UUID);
    await this._changeStatePromise;
  }

  async changeMode(mode) {
    log.debug(`changeMode('${mode}')`);

    await this._changeStatePromise;

    this._changeStatePromise = this._changeMode(mode);
    return await this._changeStatePromise;
  }

  async _changeBeaconUuid(uuid) {
    log.debug(`_changeBeaconUuid('${uuid}')`);

    if (this._beaconInfo.uuid === uuid) {
      return;
    }

    // TODO: Save this beacon to disk.
    const advertising = this._advertisingMode === ADVERTISING_BEACON;

    await this._off();

    this._beaconInfo.uuid = uuid;

    if (advertising) {
      await this._startAdvertisingBeacon();
    }
  }

  async _changeMode(mode) {
    log.debug(`_changeMode('${mode}')`);

    if (this._mode !== mode) {
      await this._off();

      switch (mode) {
        case MODE_OFF: {
          await this._uninstallConfigService();
          break;
        }

        case MODE_CONFIGURE: {
          await this._installConfigService();
          await this._startAdvertisingConfigService();
          break;
        }

        case MODE_NORMAL: {
          await this._uninstallConfigService();
          await this._startAdvertisingBeacon();
          await this._startRanger();
          break;
        }

        default:
          throw new Error(`Invalid mode: '${mode}'`);
      }

      this._mode = mode;
    }

    switch (mode) {
      case MODE_OFF:
        return null;

      case MODE_CONFIGURE:
        return this._configService;

      case MODE_NORMAL:
        return this._ranger;

      default:
        throw new Error(`Invalid mode: '${mode}'`);
    }
  }

    async _startAdvertisingConfigService() {
      log.debug('_startAdvertisingConfigService()');

      if (this._advertisingMode === ADVERTISING_CONFIG) {
        return;
      }

      await new Promise((resolve, reject) => {
        const callback = err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        };
        bleno.startAdvertising('Silkcam', [ ConfigService.uuid ], callback);
      });

      this._advertisingMode = ADVERTISING_CONFIG;
    }

  async _startAdvertisingBeacon() {
    log.debug('_startAdvertisingBeacon()');

    if (this._advertisingMode === ADVERTISING_BEACON) {
      return;
    }

    if (this._adapterState !== 'poweredOn') {
      log.warn('Ignoring _startAdvertisingBeacon() because adapter state is ' +
               `'${this._adapterState}'`);
      return;
    }

    await new Promise((resolve, reject) => {
      const callback = err => {
        if (err) {
          reject(err);
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

    this._advertisingMode = ADVERTISING_BEACON;
  }

  async _off() {
    log.debug('_off()');

    if (this._adapterState !== 'poweredOn') {
      log.warn('Ignoring _off() because adapter state is ' +
               `'${this._adapterState}'`);
      return;
    }

    let promises = [ ];

    if (this._ranger) {
      promises.push(this._ranger.stop());
    }

    if (this._advertisingMode !== ADVERTISING_OFF) {
      promises.push(new Promise(resolve => {
        bleno.stopAdvertising(resolve);
      }));
    }

    if (promises.length) {
      await Promise.all(promises);
    }

    this._advertisingMode = ADVERTISING_OFF;
    this._ranger = null;
  }

  async _installConfigService() {
    log.debug('_installConfigService()');

    if (this._configService) {
      return;
    }

    if (this._adapterState !== 'poweredOn') {
      log.warn('Ignoring _installConfigService() because adapter state is ' +
               `'${this._adapterState}'`);
      return;
    }

    let services = this._services.slice();

    const configService = new ConfigService(this._deviceId);
    services.push(configService);

    await new Promise((resolve, reject) => {
      const callback = err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };
      bleno.setServices(services, callback);
    });

    bleno.addListener('accept', this._onBlenoAccept);
    bleno.addListener('disconnect', this._onBlenoDisconnect);

    this._configService = configService;
    this._services.push(configService);
  }

  async _uninstallConfigService() {
    log.debug('_uninstallConfigService()');

    if (!this._configService) {
      return;
    }

    if (this._adapterState !== 'poweredOn') {
      log.warn('Ignoring _uninstallConfigService() because adapter state is ' +
               `'${this._adapterState}'`);
      return;
    }

    assert(this._services.indexOf(this._configService) !== -1);

    let services = this._services.filter(service => {
      return service !== this._configService;
    });

    await new Promise((resolve, reject) => {
      bleno.setServices(services, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    clearTimeout(this._updateRssiTimeout);
    this._updateRssiTimeout = null;

    bleno.removeListener('accept', this._onBlenoAccept);
    bleno.removeListener('disconnect', this._onBlenoDisconnect);

    this._services.splice(this._services.indexOf(this._configService), 1);
    this._configService = null;
  }

  async _startRanger() {
    log.debug('_startRanger()');

    if (this._ranger) {
      return;
    }

    if (this._adapterState !== 'poweredOn') {
      log.warn('Ignoring _startRanger() because adapter state is ' +
               `'${this._adapterState}'`);
      return;
    }

    const ranger = new Ranger(noble);
    await ranger.start();

    this._ranger = ranger;
  }

  // Event handlers. These are pre-bound so that I can remove them.

  _onAdapterStateChange = adapterState => {
    log.debug(`onAdapterStateChange('${adapterState}')`);

    if (this._adapterState === adapterState) {
      return;
    }

    if (adapterState === 'poweredOn') {
      // TODO: Handle restart
      log.info(`Adapter state is now '${adapterState}'`);
    } else {
      this._changeMode(MODE_OFF);
    }

    this._adapterState = adapterState;
  }

  _onBlenoAccept = addr => {
    log.debug(`_onBlenoAccept('${addr}')`);
    assert(this._configService);

    if (this._configuringDeviceAddress) {
      log.info('Another device is already configuring, ignoring this ' +
               'connection');
      return;
    }

    assert(!this._updateRssiTimeout);

    this._configuringDeviceAddress = addr;

    const updateInterval = 100;

    const updateRssi = () => {
      assert(this._configService);
      bleno.updateRssi((err, rssi) => {
        if (err) {
          log.warn(err);
          return;
        }
        if (!this._configService) {
          return;
        }
        this._configService.updateRssi(rssi);
        this._updateRssiTimeout = setTimeout(updateRssi, updateInterval);
      });
    };

    clearTimeout(this._updateRssiTimeout);
    this._updateRssiTimeout = setTimeout(updateRssi, updateInterval);
  }

  _onBlenoDisconnect = addr => {
    log.debug(`_onBlenoDisconnect('${addr}')`);
    assert(this._configService);

    if (this._configuringDeviceAddress !== addr) {
      return;
    }

    this._configuringDeviceAddress = null;

    clearTimeout(this._updateRssiTimeout);
    this._updateRssiTimeout = null;
  }
}

async function init() {
  assert(!initPromiseComplete);

  const stateChange = 'stateChange';
  const expectedState = caps.has('qemu') ? 'poweredOff' : 'poweredOn';

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

  log.info('Initializing');

  let deviceId;

  await Promise.all([
    getDeviceId()
      .then(id => {
        deviceId = id.pub;
      }),
    waitForState(bleno, 'bleno'),
    waitForState(noble, 'noble'),
  ]);

  /*
  // TODO: Load beacon info from /data/silk/config
  const fakeBeaconInfo = {
    uuid: 'db4963a4-c222-43b3-9b5f-c6994b274170',
    major: 0,
    minor: 0,
    measuredPower: DEFAULT_BEACON_POWER,
  };
  */

  let instance = new BluetoothLE(deviceId/*, fakeBeaconInfo*/);

  initPromiseComplete = true;

  log.info('Initialization complete');

  return instance;
}

export default async function() {
  if (initPromise) {
    log.debug('Already initializ' + (initPromiseComplete ? 'ed' : 'ing'));
  } else {
    initPromise = init();
  }
  return await initPromise;
}
