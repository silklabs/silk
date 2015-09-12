/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

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

let api = require('./api');
let events = require('events');
let btle = require('./btle');
let log = require('./log')('config');
let server = require('./server');
let wifi = require('./wifi');
let util = require('./util');

const STATE = api.btleConfigService.state;

function promisify(func, ...args) {
  return new Promise((resolve, reject) => {
    func(...args, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

class DeviceConfig extends events.EventEmitter {
  constructor() {
    super();
    this._cancelStopTimer = null;
    this._started = false;
    this._statePromise = Promise.resolve();
    this._updateRssiTimeout = null;
  }

 _onAccept(clientAddr) {
    log.info('GATT client connect:', clientAddr);

    let updateRssi = () => {
      this._bleno.updateRssi((err, rssi) => {
        if (err) {
          throw `runConfigService: ${err}`;
        }
        this._configService.updateRssi(rssi);
        this._updateRssiTimeout = setTimeout(updateRssi, 100);
      });
    };
    clearTimeout(this._updateRssiTimeout);
    this._updateRssiTimeout = setTimeout(updateRssi, 100);
  }

  _onDisconnect(clientAddr) {
    log.info('GATT client disconnect:', clientAddr);
    clearTimeout(this._updateRssiTimeout);
  }

  _onStateChange(state) {
    log.info('Device configuration state is now', state);

    if (state === STATE.REGISTERED) {
      // Join network now that we are registered
      wifi.forgetNetwork()
      .then(() => {
        wifi.joinNetwork(this._configService.ap,
          this._configService.unsecured ? '' : this._configService.secret);
      })
      .then(() => {
        this.emit('configured');
      })
      .catch(e => util.processthrow(e));
    }
  }

  _isWifiOnline() {
    let s = this._configService.serverConnectionStatus;
    return s === 'wifi_online' || s === 'server_disconnected' ||
        s === 'server_connecting' || s === 'server_connected';
  }

  _onWifiStateChange(state) {
    let wifiStates = {
      'offline': 'wifi_offline',
      'scanning': 'wifi_scanning',
      'associating': 'wifi_associating',
      'associated': 'wifi_associated',
      'four_way_handshake': 'wifi_authenticating',
      'group_handshake': 'wifi_authenticating',
      'completed': 'wifi_connected',
      'dhcping': 'wifi_dhcping',
      'online': 'wifi_online',
    };

    // clear error if we are online
    if (state === 'online') {
      this._configService.errorMessage = '';
    }

    if (state in wifiStates) {
      this._configService.serverConnectionStatus = wifiStates[state];
    }
    log.info(`wifi state: ${state} (${this._configService.serverConnectionStatus})`);
  }

  _onWifiError(error) {
    let errorStr = error;

    // Use more friendly descriptions for common errors
    let wifiErrors = {
      '4way_handshake_timeout': 'wrong password',
    };
    if (error in wifiErrors) {
      errorStr = wifiErrors[error];
    }

    this._configService.errorMessage = `wifi error: ${errorStr}`;
    log.info('new wifi error', this._configService.errorMessage);
  }

  _onServerStateChange(state) {
    let serverStates = {
      'disconnect': 'server_disconnected',
      'connecting': 'server_connecting',
      'connect': 'server_connected',
    };

    if (this._isWifiOnline() && state in serverStates) {
      // Wi-Fi is offline; don't update as Wi-Fi state is more meaningful
      this._configService.serverConnectionStatus = serverStates[state];
    }
    log.info(`server state ${state} (${this._configService.serverConnectionStatus})`);
  }

  _start() {
    return Promise.resolve()
    .then(() => {
      if (this._started) {
        log.info('Config service already started');
        return Promise.resolve();
      }

      log.info('Starting config service ...');

      log.debug('Setting services');
      return promisify(this._bleno.setServices.bind(this._bleno),
                      [this._configService])
      .then(() => {
        log.debug('Starting advertising');
        return promisify(this._bleno.startAdvertising.bind(this._bleno),
                         'Silkcam',
                         [this._configService.uuid]);
      })
      .then(() => {
        log.info('Started config service');
        this._started = true;
      });
    });
  }

  _stop() {
    return Promise.resolve()
    .then(() => {
      clearTimeout(this._updateRssiTimeout);

      if (!this._started) {
        log.info('Config service already stopped');
        return Promise.resolve();
      }

      log.debug('Setting stop timeout');
      return new Promise(resolve => {
        // Keep config service up for a bit to allow the app to get final state
        // info.
        let timeout = setTimeout(resolve, 3000);

        // Allow this timeout to be skipped if we need to change state again
        // before it has elapsed.
        this._cancelStopTimer = () => {
          clearTimeout(timeout);
          resolve();
        };
      })
      .then(() => {
        log.info('Stopping config service ...');
        log.debug('Stopping advertising');
        return promisify(this._bleno.stopAdvertising.bind(this._bleno));
      })
      .then(() => {
        log.debug('Clearing services');
        return promisify(this._bleno.setServices.bind(this._bleno), []);
      })
      .then(() => {
        log.info('Stopped config service');
      });
    });
  }

  _isConfigured() {
    return wifi.networkConfigured();
  }

  init(id) {
    log.info(`Initializing config service for device ${id}`);

    this._configService = btle.configService(id.pub);
    this._bleno = btle.bleno;

    this._bleno.on('accept', clientAddr => this._onAccept(clientAddr));
    this._bleno.on('disconnect', clientAddr => this._onDisconnect(clientAddr));
    this._configService.on('stateChange', state => this._onStateChange(state));

    wifi.on('online', () => this._onWifiStateChange('online'));
    wifi.on('offline', () => this._onWifiStateChange('offline'));
    wifi.on('stateChange', state => this._onWifiStateChange(state));
    wifi.on('error', error => this._onWifiError(error));

    server.on('connect', () => this._onServerStateChange('connect'));
    server.on('disconnect', () => this._onServerStateChange('disconnect'));
    server.on('reconnecting', () => this._onServerStateChange('connecting'));
    server.on('stateChange', state => this._onServerStateChange(state));
    server.on('error', () => {}); // keep, node requires 'error' event handled

    return this._isConfigured()
      .then(() => {
        this._configService.state = STATE.REGISTERED;
        this.emit('configured');
      })
      .catch(err => {
        if (err) {
          log.error(err);
        }
        this._configService.state = STATE.UNREGISTERED;
        this.emit('unconfigured');
      });
  }

  _changeState(start) {
    if (this._cancelStopTimer) {
      this._cancelStopTimer();
      this._cancelStopTimer = null;
    }

    let func = start ? this._start : this._stop;
    func = func.bind(this);

    this._statePromise =
      this._statePromise.catch(() => undefined).then(func);
    return this._statePromise;
  }

  start() {
    log.debug('Start requested');
    return this._changeState(/* start */ true);
  }

  stop() {
    log.debug('Stop requested');
    return this._changeState(/* start */ false);
  }

  configure() {
    this.start();
  }

  unconfigure() {
    return this._isConfigured().then(() => {
      return wifi.forgetNetwork().then(() => {
        this._configService.clearState();
        return this._stop()
          .then(() => this.emit('unconfigured'));
      });
    }, () => {
      log.info('Device already unconfigured');
    });
  }
}

module.exports = new DeviceConfig();
