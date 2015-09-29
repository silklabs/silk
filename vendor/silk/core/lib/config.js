/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let api = require('./api');
let events = require('events');
let log = require('./log')('config');
let server = require('./server');
let wifi = require('./wifi');
let util = require('./util');

import assert from 'assert';
import getBTLE from './btle';

const STATE = api.btleConfigService.state;

class DeviceConfig extends events.EventEmitter {
  _initialized = false
  _initializing = false
  _btle = null
  _configService = null
  _unconfigurePromise = null

  _serverConnectionStatus = ''
  _errorMessage = ''
  _registrationState = STATE.UNREGISTERED

  _onStateChange = state => {
    log.info('Device configuration state is now', state);
    assert(this._configService);

    this._registrationState = state;

    if (state === STATE.REGISTERED) {
      // Join network now that we are registered
      wifi.forgetNetwork()
        .then(() => {
          assert(this._configService);
          return wifi.joinNetwork(this._configService.ap,
            this._configService.unsecured ? '' : this._configService.secret);
        })
        .then(() => {
          log.debug('Configured');
          this.emit('configured');
        })
        .catch(e => util.processthrow(e));
    }
  }

  _isWifiOnline() {
    const states = [
      'wifi_online',
      'server_disconnected',
      'server_connecting',
      'server_connected'
    ];
    return states.indexOf(this._serverConnectionStatus) !== -1;
  }

  _onWifiStateChange(state) {
    const wifiStates = {
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
      this._errorMessage = '';
      if (this._configService) {
        this._configService.errorMessage = this._errorMessage;
      }
    }

    if (state in wifiStates) {
      this._serverConnectionStatus = wifiStates[state];
      if (this._configService) {
        this._configService.serverConnectionStatus =
          this._serverConnectionStatus;
      }
    }
    log.info(`wifi state: ${state} (${this._serverConnectionStatus})`);
  }

  _onWifiError(error) {
    let errorStr = error;

    // Use more friendly descriptions for common errors
    const wifiErrors = {
      '4way_handshake_timeout': 'wrong password',
    };
    if (error in wifiErrors) {
      errorStr = wifiErrors[error];
    }

    this._errorMessage = `wifi error: ${errorStr}`;
    if (this._configService) {
      this._configService.errorMessage = this._errorMessage;
    }

    log.info('new wifi error', this._errorMessage);
  }

  _onServerStateChange(state) {
    const serverStates = {
      'disconnect': 'server_disconnected',
      'connecting': 'server_connecting',
      'connect': 'server_connected',
    };

    if (state === 'connect' && this._configService) {
      this._setBtleNormalMode().catch(util.processthrow);
    } else if (state === 'disconnect' &&
               this._registrationState === STATE.REGISTERED &&
               !this._configService) {
      this._setBtleConfigMode().catch(util.processthrow);
    }

    if (this._isWifiOnline() && state in serverStates) {
      // Wi-Fi is offline; don't update as Wi-Fi state is more meaningful
      this._serverConnectionStatus = serverStates[state];
      if (this._configService) {
        this._configService.serverConnectionStatus =
          this._serverConnectionStatus;
      }
    }
    log.info(`server state ${state} (${this._serverConnectionStatus})`);
  }

  _isWifiConfigured() {
    return wifi.networkConfigured()
      .then(() => true)
      .catch(() => false);
  }

  _setBtleConfigMode() {
    return this._btle.changeMode('configure')
      .then(configService => {
        if (this._configService) {
          assert(this._configService === configService);
        } else {
          configService.state = this._registrationState;
          configService.errorMessage = this._errorMessage;
          configService.serverConnectionStatus = this._serverConnectionStatus;
          configService.addListener('stateChange', this._onStateChange);
          this._configService = configService;
        }
        return configService;
      });
  }

  _unsetConfigService() {
    if (this._configService) {
      this._configService.removeListener('stateChange',
                                         this._onStateChange);
      this._configService = null;
    }
  }

  _setBtleNormalMode() {
    return this._btle.changeMode('normal')
      .then(() => this._unsetConfigService());
  }

  _setBtleOffMode() {
    return this._btle.changeMode('off')
      .then(() => this._unsetConfigService());
  }

  init() {
    if (this._initialized) {
      return Promise.reject(new Error('Already initialized'));
    }

    if (this._initializing) {
      return Promise.reject(new Error('Already initializing'));
    }

    this._initializing = true;

    log.info('Initializing config service');

    wifi.on('online', () => this._onWifiStateChange('online'));
    wifi.on('offline', () => this._onWifiStateChange('offline'));
    wifi.on('stateChange', state => this._onWifiStateChange(state));
    wifi.on('error', error => this._onWifiError(error));

    server.on('connect', () => this._onServerStateChange('connect'));
    server.on('disconnect', () => this._onServerStateChange('disconnect'));
    server.on('reconnecting', () => this._onServerStateChange('connecting'));
    server.on('stateChange', state => this._onServerStateChange(state));
    server.on('error', () => {}); // keep, node requires 'error' event handled

    const loadBtleAndStartConfigService = () => {
      return getBTLE()
        .then(btle => {
          this._btle = btle;
          return this._setBtleConfigMode();
        });
    };

    return Promise.all([ loadBtleAndStartConfigService(),
                         this._isWifiConfigured() ])
      .then(results => {
        let isConfigured = results[1];
        if (isConfigured) {
          log.debug('Configured');
          this._registrationState = STATE.REGISTERED;
          this.emit('configured');
        } else {
          log.debug('Unconfigured');
          this._registrationState = STATE.UNREGISTERED;
          this.emit('unconfigured');
        }
        this._initializing = false;
        this._initialized = true;
      })
      .catch(err => {
        log.error(err);
        throw err;
      });
  }

  unconfigure() {
    if (!this._initialized) {
      return Promise.reject(new Error('Not initialized yet'));
    }

    if (this._unconfigurePromise) {
      log.info('Device already unconfiguring');
      return this._unconfigurePromise;
    }

    if (this._registrationState === STATE.UNREGISTERED) {
      log.info('Device already unconfigured');
      return Promise.resolve();
    }

    this._registrationState = STATE.UNREGISTERED;

    // Calling the server/btle functions below can trigger events so run them on
    // the next tick to ensure that |this._unconfigurePromise| is set before any
    // event listeners have a chance to run.
    this._unconfigurePromise = Promise.resolve()
      .then(() => {
        const networkPromise =
          new Promise(resolve => {
            if (!server.connected) {
              resolve();
              return;
            }
            server.once('disconnect', resolve);
            server.disconnect();
          })
          .then(() => wifi.forgetNetwork());

        const btlePromise = this._setBtleOffMode()
          .then(() => this._btle.resetBeaconUuid())
          .then(() => this._setBtleConfigMode());

        return Promise.all([ networkPromise, btlePromise ]);
      })
      .then(() => {
        this._unconfigurePromise = null;
        log.debug('Unconfigured');
        this.emit('unconfigured');
      })
      .catch(err => {
        this._unconfigurePromise = null;
        log.error(err);
        throw err;
      });
    return this._unconfigurePromise;
  }
}

module.exports = new DeviceConfig();
