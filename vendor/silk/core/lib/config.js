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

class DeviceConfig extends events.EventEmitter {

  constructor() {
    super();
    this._started = false;
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
    return new Promise(resolve => {
      clearTimeout(this._stopTimer);

      if (this._started) {
        log.info('Config service already started');
        return resolve();
      }

      this._started = true;
      log.info('Starting config service ...');
      this._bleno.once('servicesSet', errServicesSet => {
        if (errServicesSet) {
          throw new Error(errServicesSet);
        }
        // TODO: get name from build config
        this._bleno.startAdvertising('Silkcam', [this._configService.uuid],
            err => err && log.warn('Error: ' + err));
      });

      this._bleno.once('advertisingStart', err => {
        if (err) {
          throw `runConfigService: ${err}`;
        }
        log.info('Started advertising');
        log.info('Started config service');
        return resolve();
      });

      this._bleno.setServices([this._configService]);
    });
  }

  _stop() {
    return new Promise(resolve => {
      clearTimeout(this._updateRssiTimeout);

      if (!this._started) {
        log.info('Config service already stopped');
        return resolve();
      }

      this._started = false;
      log.info('Stopping config service ...');
      this._bleno.stopAdvertising(() => {
        log.info('Stopped advertising');

        this._bleno.once('servicesSet', errServicesSet => {
          if (errServicesSet) {
            throw new Error(errServicesSet);
          }
          log.info('Stopped config service');
          return resolve();
        });
        this._bleno.setServices();
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
        log.error(err);
        this._configService.state = STATE.UNREGISTERED;
        this.emit('unconfigured');
      });
  }

  start() {
    return this._start();
  }

  stop() {
    // Keep config service up for a bit to allow the app to get final state info
    clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => this._stop(), 3000);
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
