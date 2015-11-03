/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import api from '../api';
import assert from 'assert';
import { BTLE_SOCKET_UUIDS } from 'silk-api';
import ConfigSessionListener from './config_session_listener';
import createLog from '../log';
import { EventEmitter } from 'events';
import eventToPromise from 'event-to-promise';
import fs from 'mz/fs';
import getBTLE from '../btle';
import getDeviceId from '../deviceid';
import NormalSessionListener from './normal_session_listener';
import server from '../server';
import wifi from '../wifi';
import * as util from '../sysutils';

const log = createLog('config');

const CONFIG_PATH = '/data/silk/config/config.json';

class DeviceConfig extends EventEmitter {
  static CONFIG_BEACON_INFO = {
    uuid: BTLE_SOCKET_UUIDS.service,
    major: 0,
    minor: 0,
  };

  _initialized = false;
  _initializing = false;
  _deviceId = ``;
  _btle = null;
  _networkStatus = null;
  _unconfigurePromise = null;
  _socketSessionListener = null;
  _config = null;

  /**
   * Persist the configuration after the device has completed registration.
   */
  async _persistConfig(secret, response = { }) {
    const config = {
      registrarPublicKey: secret.publicKey,
      registrationToken: secret.regToken,
      ...response,
    };

    await fs.writeFile(CONFIG_PATH, JSON.stringify(config));
    log.info('Updated config file', CONFIG_PATH, config);

    this._config = config;
  }

  async _loadConfig() {
    if (!await fs.exists(CONFIG_PATH)) {
      return null;
    }
    try {
      this._config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
    } catch(error) {
      log.warn(`Failed to parse config, removing`, error.stack);
      await fs.unlink(CONFIG_PATH);
      this._config = null;
    }
  }

  async _registerDevice(secret, timeoutMS = 3 * 1000, max = 5, retry = 0) {
    if (retry > max) {
      throw new Error(`Exhausted retries for device registration...`);
    }

    // TODO: Remove this junk once our api supports proper retries...
    try {
      return await api.device.completeRegistration({
        registrarPublicKey: secret.publicKey,
        registrationToken: secret.regToken,
      });
    } catch (err) {
      log.info('Error during device registration retrying', err.stack);
      await util.timeout(timeoutMS * retry);
      return this._registerDevice(secret, timeoutMS, max, retry + 1);
    }
  }

  _onConfigured = async secret => {
    log.debug(`DeviceConfig._onConfigured()`);

    assert(secret.publicKey);
    assert(secret.regToken);

    try {
      await wifi.forgetNetwork();
      await wifi.joinNetwork(secret.accessPoint, secret.password);

      // Wait until the network is ready to use then register the device...
      await Promise.all([
        // Persist the configuration details we got over BTLE this includes the
        // registrarPublicKey so we can communicate securely with that specific
        // account in the future.
        this._persistConfig(secret),

        // Wait until we can connect to the internet...
        // XXX: This may never happen so we should present some special
        // error handling+state here...
        eventToPromise(this._networkStatus, 'online')
      ]);

      log.info('Wifi setup complete... Contacting the server...');
      let result = await this._registerDevice(secret);
      log.info('Registration complete', result);

      if (!result.success) {
        throw new Error(`Failed to register device for known reason`);
      }

      if (!result.beaconUUID) {
        throw new Error(`No beacon UUID delivered with successful ` +
                        `registration!`);
      }

      // Update the config on disk with the response so that we know we are
      // completely registered.
      await this._persistConfig(secret, result);
    } catch (error) {
      log.error('Failed to register device, starting over', error.stack);

      await Promise.all([
        fs.exists(CONFIG_PATH)
          .then(exists => {
            if (exists) {
              fs.unlink(CONFIG_PATH);
            }
          }),
        this._unconfigureNetwork(),
      ]);

      this._socketSessionListener.sendRestart(error.toString());

      throw error;
    }

    this._socketSessionListener.sendComplete();

    log.info('Configured');
    this.emit('configured');
  }

  _onDismissed() {
    log.debug(`DeviceConfig._onDismissed()`);

    this._socketSessionListener.disconnect();
    this._socketSessionListener = null;

    server.addListener(`connect`, this._onServerConnect);
    server.addListener(`disconnect`, this._onServerDisconnect);

    this._btle.changeMode(this._btle.MODE_OFF);
  }

  _onServerConnect = async () => {
    log.debug(`DeviceConfig._onServerConnect()`);

    assert(this._config);
    assert(this._config.beaconUUID);

    this._socketSessionListener.disconnect();
    this._socketSessionListener = null;

    await this._btle.changeMode(this._btle.MODE_OFF);
  };

  _onServerDisconnect = async () => {
    log.debug(`DeviceConfig._onServerDisconnect()`);

    assert(this._config);
    assert(this._config.beaconUUID);

    await this._btle.changeMode(this._btle.MODE_OFF),

    this._btle.beaconInfo = this._getBeaconInfo();

    this._socketSessionListener = new NormalSessionListener();
    this._btle.socketSessionListener = this._socketSessionListener;

    await this._btle.changeMode(this._btle.MODE_SCAN);
  };

  _getBeaconInfo() {
    if (this._config && this._config.success) {
      log.debug(`Returning beacon uuid '${this._config.beaconUUID}'`);
      return {
        uuid: this._config.beaconUUID,
        // TODO: Store major/minor
        major: 0,
        minor: 0,
      };
    }
    log.debug(`Returning beacon uuid ` +
              `'${DeviceConfig.CONFIG_BEACON_INFO.uuid}'`);
    return DeviceConfig.CONFIG_BEACON_INFO;
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

    assert(api.accessToken, 'Has api.accessToken set');

    let [ deviceId, btle ] = await Promise.all([
      getDeviceId(),
      getBTLE(),
      this._loadConfig()
    ]);

    assert(deviceId);
    assert(btle);
    assert(btle.mode === btle.MODE_OFF);

    this._deviceId = deviceId.pub;
    this._btle = btle;

    log.info('Device configuration', this._config);

    this._btle.beaconInfo = this._getBeaconInfo();

    if (this._config && this._config.success) {
      this._socketSessionListener = new NormalSessionListener();
      this._btle.socketSessionListener = this._socketSessionListener;

      await this._btle.changeMode(this._btle.MODE_SCAN);
      this.emit('configured');

      server.addListener(`connect`, this._onServerConnect);
      server.addListener(`disconnect`, this._onServerDisconnect);
    } else {
      this._config = null;

      this._socketSessionListener = new ConfigSessionListener(this);
      this._btle.socketSessionListener = this._socketSessionListener;

      // Ensure we don't have any stale state lying around...
      await Promise.all([
        wifi.forgetNetwork(),
        this._btle.changeMode(this._btle.MODE_SCAN)
      ]);

      this.emit('unconfigured');
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
        log.error('Error unconfiguring', err.stack);
        throw err;
      });
  }

  async _unconfigureNetwork() {
    log.info('Unconfigure network...');

    server.removeListener(`connect`, this._onServerConnect);
    server.removeListener(`disconnect`, this._onServerDisconnect);

    if (server.connected) {
      server.disconnect();
      log.info('Unconfigure - Disconnected from server');
    }

    await wifi.forgetNetwork();
    log.info('Unconfigure - forgot network...');
  }

  async _unconfigureBTLE() {
    if (this._socketSessionListener) {
      this._socketSessionListener.disconnect();
      this._socketSessionListener = null;
    }

    log.debug(`Turning off bluetooth`);
    await this._btle.changeMode(this._btle.MODE_OFF);

    const beaconInfo = this._getBeaconInfo();
    assert(beaconInfo === DeviceConfig.CONFIG_BEACON_INFO);

    this._btle.beaconInfo = beaconInfo;

    this._socketSessionListener = new ConfigSessionListener(this);
    this._btle.socketSessionListener = this._socketSessionListener;

    log.debug(`Turning bluetooth back on`);
    await this._btle.changeMode(this._btle.MODE_SCAN);
  }

  async _unconfigure() {
    // Calling the server/btle functions below can trigger events so run them on
    // the next tick to ensure that |this._unconfigurePromise| is set before any
    // event listeners have a chance to run.
    await Promise.resolve();

    if (!this._initialized) {
      throw new Error('Not initialized yet');
    }

    if (!this._config) {
      log.info('Device already unconfigured');
      return;
    }

    this._config = null;

    // Remove the config file so we know we need to reconfigure...
    if (await fs.exists(CONFIG_PATH)) {
      await fs.unlink(CONFIG_PATH);
    }

    // Unconfigure BTLE and our network setup...
    await Promise.all([
      this._unconfigureBTLE(),
      this._unconfigureNetwork()
    ]);
  }
}

module.exports = new DeviceConfig();
