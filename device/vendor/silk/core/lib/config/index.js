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
import fs from 'mz/fs';
import getBTLE from '../btle';
import getDeviceId from '../deviceid';
import * as Joi from 'joi';
import makeDeferred from '../deferred';
import NormalSessionListener from './normal_session_listener';
import server from '../server';
import * as util from '../sysutils';
import wifi from '../wifi';

const log = createLog('config');

const CONFIG_PATH = '/data/silk/config/config.json';

const REGISTRATION_RESPONSE_SCHEMA = Joi.object().keys({
  success:
    Joi.boolean().required(),
  beaconUUID:
    Joi.any().when(`success`, {
      is: true,
      then: Joi.string().guid().required(),
      otherwise: Joi.string().optional(),
    }),
}).required();

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
  _wifiAbortConnection = null;
  _unconfigurePromise = null;
  _socketSessionListener = null;
  _config = null;
  _serverConnected = false;

  async _writeConfig(config) {
    fs.writeFile(CONFIG_PATH, JSON.stringify(config));
    log.info('Updated config file', CONFIG_PATH, config);
  }

  /**
   * Persist the configuration after the device has completed registration.
   */
  async _persistConfig(secret, response = { }) {
    const config = {
      registrarPublicKey: secret.publicKey,
      registrationToken: secret.regToken,
      serverUrl: secret.serverUrl,
      ...response,
    };

    await this._writeConfig(config);
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

    // Only accept the server URL from the app in development.  In production
    // the server URL is locked to avoid the potential of device
    // hijacking (TODO: Need to clarify this requirement).
    if (!util.getboolprop('ro.debuggable')) {
      secret.serverUrl = null;
    }
    this._setApiServerUrl(secret.serverUrl);

    try {
      await wifi.forgetNetwork();
      await wifi.joinNetwork(secret.accessPoint, secret.password);

      // |wifi.joinNetwork()| resolves as soon as it has issued the commands to
      // the wpa supplicant. It then tries to connect to the network over and
      // over again even if such attempts are futile (e.g. the password is
      // incorrect). We don't want to wait forever for the 'online' event below
      // if we're in one of these loops, so we need a mechanism to break out of
      // the connection loop. To do that we establish a deferred that we can
      // reject after a few failed attempts, and then race with that deferred.
      // ConfigSessionListener rejects the deferred by calling
      // |_stopRetryingWifiConnection|. The deferred will never be accepted.
      const deferred = makeDeferred();

      assert(!this._wifiAbortConnection);
      this._wifiAbortConnection = deferred.reject;

      log.info('Connecting to wifi');

      await Promise.race([
        // Race between a successful wifi connection and...
        wifi.online(),

        // ... the deferred rejection if we need to break out of a connection
        // loop.
        deferred.promise,
      ]);

      assert(this._wifiAbortConnection);
      this._wifiAbortConnection = null;

      log.info('Contacting the server');
      let response = await this._registerDevice(secret);

      Joi.validate(
        response,
        REGISTRATION_RESPONSE_SCHEMA,
        { stripUnknown: true },
        (error, value) => {
          if (error) {
            throw error;
          }
          response = value;
        }
      );

      if (!response.success) {
        throw new Error(`Failed to register device for known reason`);
      }

      log.info('Registration complete', response);

      // Update the config on disk with the response so that we know we are
      // completely registered.
      await this._persistConfig(secret, response);
    } catch (error) {
      log.warn('Failed to register device', error.stack || error);

      this._stopRetryingWifiConnection(error);

      await Promise.all([
        fs.exists(CONFIG_PATH)
          .then(exists => {
            if (exists) {
              fs.unlink(CONFIG_PATH);
            }
          }),
        this._unconfigureNetwork(),
      ]);

      // If we're still connected then we can try again.
      this._socketSessionListener.maybeSendRestart(error.toString());
      return;
    }

    assert(!this._wifiAbortConnection);

    this._socketSessionListener.sendComplete();

    log.info('Configured');
    this.emit('configured');
  }

  _stopRetryingWifiConnection(error) {
    log.debug(`DeviceConfig._stopRetryingWifiConnection(` +
              `'${error.toString()}')`);

    if (this._wifiAbortConnection) {
      log.debug(`Rejecting wifi connection promise`);
      this._wifiAbortConnection(error);
      this._wifiAbortConnection = null;
    }
  }

  _onDismissed() {
    log.debug(`DeviceConfig._onDismissed()`);

    this._socketSessionListener.disconnect();
    this._socketSessionListener = null;

    this._btle.publicKeys = [ this._config.registrarPublicKey ];

    server.addListener(`connect`, this._onServerConnect);
    server.addListener(`disconnect`, this._onServerDisconnect);

    this._btle.changeMode(this._btle.MODE_OFF);
  }

  _onServerConnect = async () => {
    log.debug(`DeviceConfig._onServerConnect()`);

    assert(this._config);
    assert(this._config.beaconUUID);
    assert(!this._serverConnected);

    this._serverConnected = true;

    if (this._socketSessionListener) {
      this._socketSessionListener.disconnect();
      this._socketSessionListener = null;
    }

    await this._btle.changeMode(this._btle.MODE_OFF);
  };

  _onServerDisconnect = async () => {
    log.debug(`DeviceConfig._onServerDisconnect()`);

    assert(this._config);
    assert(this._config.beaconUUID);

    this._serverConnected = false;

    await this._btle.changeMode(this._btle.MODE_OFF);

    // It's possible that the server connected while we were turning off
    // bluetooth.
    if (this._serverConnected) {
      return;
    }

    this._btle.beaconInfo = this._getBeaconInfo();

    this._socketSessionListener = new NormalSessionListener(this);
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

  /*
   Sets the server URL used by the API.

   If serverUrl is null, try the URL persisted in the device configuration first
   then fall back to the default URL in the API itself
  */
  _setApiServerUrl(serverUrl) {
    if (!serverUrl) {
      if (this._config && this._config.success) {
        serverUrl = this._config.serverUrl;
      }
    }
    log.info(`api serverUrl: ${serverUrl}`);
    api.loadConfig({serverUrl: serverUrl});
  }

  async init() {
    if (this._initialized) {
      return Promise.reject(new Error('Already initialized'));
    }

    if (this._initializing) {
      return Promise.reject(new Error('Already initializing'));
    }

    this._initializing = true;
    log.info('Initializing config service');

    let [ deviceId, btle ] = await Promise.all([
      getDeviceId(),
      getBTLE(),
      this._loadConfig()
    ]);

    assert(deviceId);
    assert(btle);
    assert(btle.mode === btle.MODE_OFF);

    this._deviceId = deviceId.pub;
    api.accessToken = deviceId;
    this._btle = btle;

    log.info('Device configuration', this._config);

    this._btle.beaconInfo = this._getBeaconInfo();

    if (this._config && this._config.success) {
      this._btle.publicKeys = [ this._config.registrarPublicKey ];

      this._setApiServerUrl();

      this._socketSessionListener = new NormalSessionListener(this);
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
    this._btle.publicKeys = null;

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

  /**
   * Clear the server URL received from the app during device configuration.
   */
  async forceDefaultServerUrl() {
    this._config.serverUrl = undefined;
    await this._writeConfig(this._config);
  }
}

module.exports = new DeviceConfig();
