/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import api from './api';
import events from 'events';
import createLog from './log';
import fs from 'mz/fs';
import eventToPromise from 'event-to-promise';
import server from './server';
import wifi from './wifi';
import * as util from './sysutils';

import assert from 'assert';
import getBTLE from './btle';

const log = createLog('config');

const STATE = api.btleConfigService.state;
const CONFIG_PATH = '/data/silk/config/config.json';

const SERVER_STATE_TO_CONNECTION_STATUS = {
  'disconnect': 'server_disconnected',
  'connecting': 'server_connecting',
  'connect': 'server_connected',
};

// Keys: see WIFI_STATES in wifi.js
const WIFI_STATE_TO_CONNECTION_STATUS = {
  'disconnected': 'wifi_disconnected',
  'scanning': 'wifi_scanning',
  'associating': 'wifi_associating',
  'associated': 'wifi_associated',
  'authenticating': 'wifi_authenticating',
  'four_way_handshake': 'wifi_authenticating',
  'group_handshake': 'wifi_authenticating',
  'completed': 'wifi_connected',
  // The following values are not part of WIFI_STATES (wifi.js).
  // This next value is emitted by WpaMonitor manually as it initializes
  // the DHCP process.
  'dhcping': 'wifi_dhcping',
  // These two values correspond to the 'online' and 'offline' events of
  // WpaMonitor and represent the overall state of the internet uplink.
  'online': 'wifi_online',
  'offline': 'wifi_offline',
};

const ONLINE_CONNECTION_STATUSES = [
  'wifi_online',
  'server_disconnected',
  'server_connecting',
  'server_connected',
];

class DeviceConfig extends events.EventEmitter {
  _initialized = false;
  _initializing = false;
  _btle = null;
  _networkStatus = null;
  _configService = null;
  _unconfigurePromise = null;

  _serverConnectionStatus = '';
  _errorMessage = '';
  _registrationState = STATE.UNREGISTERED;

  /**
   * Persist the configuration after the device has completed registration.
   */
  async _persistConfig(configService, success = false) {
    const config = JSON.stringify({
      registrarPublicKey: configService.registrarPublicKey,
      registrationToken: configService.registrationToken,
      success
    }, null, 2);

    await fs.writeFile(CONFIG_PATH, config);
    log.info('Updated config file', CONFIG_PATH);
  }

  async _loadConfig() {
    if (!await fs.exists(CONFIG_PATH)) {
      return null;
    }
    return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  }

  async _registerDevice(_configService, timeoutMS = 3 * 1000, max = 5, retry = 0) {
    if (retry > max) {
      throw new Error(`Exhausted retries for device registration...`);
    }

    // TODO: Remove this junk once our api supports proper retries...
    try {
      return await api.device.completeRegistration({
        registrarPublicKey: _configService.registrarPublicKey,
        registrationToken: _configService.registrationToken
      });
    } catch (err) {
      log.info('Error during device registration retrying', err.stack);
      await util.timeout(timeoutMS * retry);
      return this._registerDevice(_configService, timeoutMS, max, retry + 1);
    }
  }

  _onStateChange = async state => {
    log.info('Device configuration state is now', state);
    assert(this._configService, '_configService required');

    this._registrationState = state;

    if (state === STATE.REGISTERED) {
      log.info('Registering new device...');
      let secret = this._configService.unsecured ? '' :
        this._configService.secret;

      await wifi.forgetNetwork(),
      assert(this._configService, '_configService required');
      assert(api.accessToken, 'has api.accessToken set');
      await wifi.joinNetwork(this._configService.ap, secret),

      // Wait until the network is ready to use then register the device...
      await Promise.all([
        // Persist the configuration details we got over BTLE this includes the
        // registrarPublicKey so we can communicate securely with that specific
        // account in the future.
        this._persistConfig(this._configService, false),

        // Wait until we can connect to the internet...
        // XXX: This may never happen so we should present some special
        // error handling+state here...
        eventToPromise(this._networkStatus, 'online')
      ]);

      try {
        log.info('Wifi setup complete... Contacting the server...');
        let result = await this._registerDevice(this._configService);
        log.info('Registration complete', result);

        if (!result.success) {
          throw new Error(`Failed to register device for known reason`);
        }

        // Update the config on disk with the success flag so we know we are
        // completely registered...
        await this._persistConfig(this._configService, true);
      } catch (err) {
        // XXX: Semi-hack forget wifi so we are sure to reconfigure...
        log.error('Failed to register device', err.stack);
        await wifi.forgetNetwork();
        throw err;
      }
      log.debug('Configured');
      this.emit('configured');
    }
  };

  _isWifiOnline() {
    return ONLINE_CONNECTION_STATUSES.indexOf(this._serverConnectionStatus) !== -1;
  }

  _onWifiStateChange(state) {
    // clear error if we are online
    if (state === 'online') {
      this._errorMessage = '';
      if (this._configService) {
        this._configService.errorMessage = this._errorMessage;
      }
    }

    if (state in WIFI_STATE_TO_CONNECTION_STATUS) {
      this._serverConnectionStatus = WIFI_STATE_TO_CONNECTION_STATUS[state];
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
    if (state === 'connect' && this._configService) {
      this._setBtleNormalMode().catch(util.processthrow);
    } else if (state === 'disconnect' &&
               this._registrationState === STATE.REGISTERED &&
               !this._configService) {
      this._setBtleConfigMode().catch(util.processthrow);
    }

    if (this._isWifiOnline() && state in SERVER_STATE_TO_CONNECTION_STATUS) {
      // Wi-Fi is offline; don't update as Wi-Fi state is more meaningful
      this._serverConnectionStatus = SERVER_STATE_TO_CONNECTION_STATUS[state];
      if (this._configService) {
        this._configService.serverConnectionStatus =
          this._serverConnectionStatus;
      }
    }
    log.info(`server state ${state} (${this._serverConnectionStatus})`);
  }

  _isWifiConfigured() {
    return wifi.networkConfigured()
      .then(() => {
        log.info('wifi is configured...');
        return true;
      })
      .catch(() => {
        log.info('wifi is not configured...');
        return false;
      });
  }

  _setBtleConfigMode() {
    return this._btle.changeMode('configure')
      .then(configService => {
        if (this._configService) {
          assert(this._configService === configService);
        } else if (configService !== null) {
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

  async init(networkStatus) {
    if (this._initialized) {
      return Promise.reject(new Error('Already initialized'));
    }

    if (this._initializing) {
      return Promise.reject(new Error('Already initializing'));
    }

    this._initializing = true;
    this._networkStatus = networkStatus;

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

    this._btle = await getBTLE();

    // Not configured yet...
    let config = await this._loadConfig();
    log.info('Loading device configuration...', config);
    if (!config || !config.success) {
      // Ensure we don't have any stale state lying around...
      await Promise.all([
        wifi.forgetNetwork(),
        this._setBtleConfigMode()
      ]);
      this._registrationState = STATE.UNREGISTERED;
      this.emit('unconfigured');
    }

    if (config && config.success) {
      this._registrationState = STATE.REGISTERED;
      await this._setBtleNormalMode();
      this.emit('configured');
    }

    this._initializing = false;
    this._initialized = true;
  }

  unconfigure() {
    if (this._unconfigurePromise) {
      return this._unconfigurePromise;
    }

    return this._unconfigurePromise = this._unconfigure()
      .then(() => {
        this._unconfigurePromise = null;
        log.debug('Unconfigured');
        this.emit('unconfigured');
      })
      .catch(err => {
        this._unconfigurePromise = null;
        log.error('Error unconfiguring', err.toString(), err.stack);
        throw err;
      });
  }

  async _unconfigureNetwork() {
    log.verbose('Unconfigure network...');
    if (server.connected) {
      server.disconnect();
      log.verbose('Unconfigure - Disconnected from server');
    }

    await wifi.forgetNetwork();
    log.verbose('Unconfigure - forgot network...');
  }

  async _unconfigureBTLE() {
    log.verbose('Unconfigure - turning off BTLE mode');
    await this._setBtleOffMode();
    log.verbose('Unconfigure - BTLE mode off');
    await this._btle.resetBeaconUuid();
    log.verbose('Unconfigure - BTLE reset beacon');
    await this._setBtleConfigMode();
    log.verbose('Unconfigure - Set BTLE to configure mode');
  }

  async _unconfigure() {
    if (!this._initialized) {
      throw new Error('Not initialized yet');
    }

    if (this._unconfigurePromise) {
      throw new Error('Device already unconfiguring');
    }

    if (this._registrationState === STATE.UNREGISTERED) {
      log.info('Device already unconfigured');
      return;
    }

    this._registrationState = STATE.UNREGISTERED;

    // Calling the server/btle functions below can trigger events so run them on
    // the next tick to ensure that |this._unconfigurePromise| is set before any
    // event listeners have a chance to run.
    await Promise.resolve();

    // Remove the config file so we know we need to reconfigure...
    if (await fs.exists(CONFIG_PATH)) {
      await fs.unlink(CONFIG_PATH);
    }

    // Unconfigure BTLE and our network setup...
    await Promise.all([
      this._unconfigureBTLE(),
      this._unconfigureNetwork()
    ]);

    log.verbose('Unconfigured');
  }
}

module.exports = new DeviceConfig();
