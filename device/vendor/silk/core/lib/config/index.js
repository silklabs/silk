/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import api from '../api';
import assert from 'assert';
import { BTLE_SOCKET_UUIDS } from 'silk-api';
import ConfigSessionListener from './config_session_listener';
import createLog from '../log';
import { EventEmitter } from 'events';
import fs from 'mz/fs';
import getBTLE from '../btle/parent';
import getDeviceId from '../deviceid';
import * as Joi from 'joi';
import makeDeferred from '../deferred';
import NormalSessionListener from './normal_session_listener';
import * as util from '../sysutils';
import wifi from 'silk-wifi';

import type Server from '../server';

const log = createLog('config');

const CONFIG_PATH = 'data/silk/config/config.json';

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

// maps wifi states to a connection status string that is sent to the app
const WIFI_STATE_MAP = new Map([
  [ 'scanning', 'wifi_scanning' ],
  [ 'associating', 'wifi_associating' ],
  [ 'associated', 'wifi_associated' ],
  [ 'four_way_handshake', 'wifi_authenticating' ],
  [ 'group_handshake', 'wifi_authenticating' ],
  [ 'completed', 'wifi_connected' ],
  // The following values are not part of WIFI_STATES (wifi.js).
  // This next value is emitted by WpaMonitor manually as it initializes
  // the DHCP process.
  [ 'dhcping', 'wifi_dhcping' ],
  // These two values correspond to the 'online' and 'offline' events of
  // WpaMonitor and represent the overall state of the internet uplink.
  [ 'online', 'wifi_online' ],
  [ 'offline', 'wifi_offline' ],
]);

// maps wifi errors to a connection status string that is sent to the app
const WIFI_ERROR_MAP = new Map([
  [ 'invalid_0', 'wifi_error (0)' ],
  [ 'unspecified', 'wifi_error (1)' ],
  [ 'prev_auth_not_valid', 'wifi_wrong_password (2)' ],
  [ 'deauth_leaving', 'wifi_deauth_leaving (3)' ],
  [ 'disassoc_due_to_inactivity', 'wifi_disassoc_due_to_inactivity (4)' ],
  [ 'disassoc_ap_busy', 'wifi_disassoc_ap_busy (5)' ],
  [ 'class2_frame_from_nonauth_sta', 'wifi_class2_frame_from_nonauth_sta (6)' ],
  [ 'class3_frame_from_nonassoc_sta', 'wifi_class3_frame_from_nonassoc_sta (7)' ],
  [ 'disassoc_sta_has_left', 'wifi_disassoc_sta_has_left (8)' ],
  [ 'sta_req_assoc_without_auth', 'wifi_sta_req_assoc_without_auth (9)' ],
  [ 'pwr_capability_not_valid', 'wifi_pwr_capability_not_valid (10)' ],
  [ 'supported_channel_not_valid', 'wifi_supported_channel_not_valid (11)' ],
  [ 'invalid_12', 'wifi_error (12)' ],
  [ 'invalid_ie', 'wifi_error (13)' ],
  [ 'michael_mic_failure', 'wifi_michael_mic_failure (14)' ],
  [ '4way_handshake_timeout', 'wifi_wrong_password (15)' ],
  [ 'group_key_update_timeout', 'wifi_group_key_update_timeout (16)' ],
  [ 'ie_in_4way_differs', 'wifi_ie_in_4way_differs (17)' ],
  [ 'group_cipher_not_valid', 'wifi_group_cipher_not_valid (18)' ],
  [ 'pairwise_cipher_not_valid', 'wifi_pairwise_cipher_not_valid (19)' ],
  [ 'akmp_not_valid', 'wifi_akmp_not_valid (20)' ],
  [ 'unsupported_rsn_ie_version', 'wifi_unsupported_rsn_ie_version (21)'],
  [ 'invalid_rsn_ie_capab', 'wifi_invalid_rsn_ie_capab (22)' ],
  [ 'ieee_802_1x_auth_failed', 'wifi_ieee_802_1x_auth_failed (23)' ],
  [ 'cipher_suite_rejected', 'wifi_cipher_suite_rejected (24)' ],
  [ 'tdls_teardown_unreachable', 'wifi_tdls_teardown_unreachable (25)' ],
  [ 'tdls_teardown_unspecified', 'wifi_tdls_teardown_unspecified (26)' ],
  [ 'invalid_27', 'wifi_error (27)' ],
  [ 'invalid_28', 'wifi_error (28)' ],
  [ 'invalid_29', 'wifi_error (29)' ],
  [ 'invalid_30', 'wifi_error (30)' ],
  [ 'invalid_31', 'wifi_error (31)' ],
  [ 'invalid_32', 'wifi_error (32)' ],
  [ 'invalid_33', 'wifi_error (33)' ],
  [ 'disassoc_low_ack', 'wifi_disassoc_low_ack (34)' ],
]);

// maps server states to a connection status string that is sent to the app
const SERVER_STATE_MAP = new Map([
  [ 'connecting', 'server_connecting' ],
  [ 'connected', 'server_connected' ],
  [ 'disconnected', 'server_disconnected' ],
  [ 'reconnecting', 'server_reconnecting' ],
]);

/**
 *
 */
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
  _config = null;
  _serverConnected = false;
  _server: Server = null;
  _socketSessionListeners = [ ];
  _configuringSocketSessionListener = null;
  _sessionStatus = ``;
  _sessionErrorCode = ``;
  _lastWifiScanResults = null;

  async _writeConfig(config) {
    fs.writeFile(CONFIG_PATH, JSON.stringify(config));
    log.info('Updated config file', CONFIG_PATH, config);
  }

  /**
   * Persist the configuration after the device has completed registration.
   * @private
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

  _beginConfigure(sessionListener) {
    log.debug(`DeviceConfig._beginConfigure()`);

    assert(sessionListener instanceof ConfigSessionListener);
    assert(!this._config);
    assert(!this._configuringSocketSessionListener);
    assert(this._socketSessionListeners.length);

    this._btle.pauseScan();

    this._configuringSocketSessionListener = sessionListener;

    // Disconnect all other sessions.
    if (this._socketSessionListeners.length > 1) {
      let existingListeners = this._socketSessionListeners;
      this._socketSessionListeners = [ sessionListener ];

      for (let listener of existingListeners) {
        if (listener !== sessionListener) {
          listener.disconnect();
        }
      }
    } else {
      assert(this._socketSessionListeners[0] === sessionListener);
    }

    // Send wifi scan results now if we have them.
    if (this._lastWifiScanResults) {
      sessionListener.sendWifiScanResults(this._lastWifiScanResults);
    }
  }

  _cancelConfigure() {
    log.debug(`DeviceConfig._cancelConfigure()`);

    assert(this._configuringSocketSessionListener);
    this._configuringSocketSessionListener = null;

    if (!this._config || !this._config.success) {
      this._btle.resumeScan();
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

    assert(this._configuringSocketSessionListener);
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
      if (this._configuringSocketSessionListener) {
        const reason = error.message;
        this._configuringSocketSessionListener.maybeSendRestart(reason);
      }
      return;
    }

    assert(!this._wifiAbortConnection);
    assert(this._configuringSocketSessionListener);

    this._btle.publicKeys = [this._config.registrarPublicKey];
    this._configuringSocketSessionListener.sendComplete();

    log.info('Configured');
    this.emit('configured');
  };

  _stopRetryingWifiConnection(error) {
    log.debug(`DeviceConfig._stopRetryingWifiConnection()`, error);

    if (this._wifiAbortConnection) {
      log.debug(`Rejecting wifi connection promise`);
      this._wifiAbortConnection(error);
      this._wifiAbortConnection = null;
    }
  }

  _onDismissed() {
    log.debug(`DeviceConfig._onDismissed()`);

    this._configuringSocketSessionListener.disconnect();
    this._configuringSocketSessionListener = null;

    this._btle.publicKeys = [ this._config.registrarPublicKey ];

    this._server.addListener(`connect`, this._onConfiguredServerConnect);
    this._server.addListener(`disconnect`, this._onConfiguredServerDisconnect);

    this._btle.changeMode(this._btle.MODE_OFF);
  }

  _onConfiguredServerConnect = async () => {
    log.debug(`DeviceConfig._onConfiguredServerConnect()`);

    assert(this._config);
    assert(this._config.beaconUUID);
    assert(!this._serverConnected);

    this._serverConnected = true;

    if (this._socketSessionListeners.length) {
      let existingListeners = this._socketSessionListeners;
      this._socketSessionListeners = [ ];

      for (let listener of existingListeners) {
        listener.disconnect();
      }
    }

    await this._btle.changeMode(this._btle.MODE_OFF);
  };

  _onConfiguredServerDisconnect = async () => {
    log.debug(`DeviceConfig._onConfiguredServerDisconnect()`);

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

  _nofityListenersOfStatus(status) {
    log.debug(`DeviceConfig._nofityListenersOfStatus('${status}')`);

    if (this._sessionStatus === status) {
      return;
    }

    this._sessionStatus = status;

    if (this._configuringSocketSessionListener) {
      assert(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendStatus(status);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendStatus(status);
      }
    }
  }

  _onWifiStateChange(state) {
    log.debug(`DeviceConfig._onWifiStateChange('${state}')`);

    let status = WIFI_STATE_MAP.get(state);
    if (!status) {
      log.error(`No status mapping for wifi state '${state}'`);
      status = `wifi_${state}`;
    }

    this._nofityListenersOfStatus(status);
  }

  _onWifiScanResults(scanResults) {
    log.debug(`DeviceConfig._onWifiScanResults()`);

    this._lastWifiScanResults = scanResults;

    if (this._configuringSocketSessionListener) {
      assert(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendWifiScanResults(scanResults);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendWifiScanResults(scanResults);
      }
    }
  }

  _onWifiError(error) {
    log.debug(`DeviceConfig._onWifiError()`, error);

    let status = WIFI_ERROR_MAP.get(error.message);
    if (!status) {
      log.error(`No error message mapping for wifi error '${status}'`);
      status = error;
    }

    this._nofityListenersOfStatus(status);

    // Special hook for wifi failures during configure.
    if (this._configuringSocketSessionListener) {
      const errorCode = WIFI_ERROR_MAP.get(error);
      assert(errorCode, `No error code for '${error}'`);
      this._configuringSocketSessionListener.onWifiError(errorCode);
    }
  }

  _onServerStateChange(state) {
    log.debug(`DeviceConfig._onServerStateChange('${state}')`);

    let status = SERVER_STATE_MAP.get(state);
    if (!status) {
      log.error(`No status mapping for server state '${state}'`);
      status = `server_${state}`;
    }

    if (wifi.isOnline()) {
      this._nofityListenersOfStatus(status);
    }
  }

  _onServerError(error) {
    log.debug(`DeviceConfig._onServerError()`, error);

    // XXX Need some mappings here someday.
    const status = error.message;

    this._nofityListenersOfStatus(status);
  }

  _onSocketSession(socketSession) {
    log.debug(`DeviceConfig._onSocketSession()`);

    if (this._configuringSocketSessionListener) {
      log.info(`Ignoring socket session because another is configuring ` +
               `already`);
      socketSession.end();
      return;
    }

    const listener = (this._config && this._config.success) ?
                     new NormalSessionListener(this, socketSession) :
                     new ConfigSessionListener(this, socketSession);

    let errorHandler;
    let closeHandler;

    const cleanup = (event) => {
      log.debug(`Cleaning up after '${event}' event`);

      socketSession.removeListener(`error`, errorHandler);
      socketSession.removeListener(`close`, closeHandler);

      if (this._socketSessionListeners.length > 1) {
        const index = this._socketSessionListeners.indexOf(listener);
        if (index > -1) {
          this._socketSessionListeners.splice(index, 1);
        }
      } else if (this._socketSessionListeners.length &&
                 this._socketSessionListeners[0] === listener) {
        this._socketSessionListeners = [];
      }

      if (this._configuringSocketSessionListener === listener) {
        this._cancelConfigure();
      }
    };

    errorHandler = () => cleanup(`error`);
    closeHandler = () => cleanup(`close`);

    socketSession.addListener(`error`, errorHandler);
    socketSession.addListener(`close`, closeHandler);

    this._socketSessionListeners.push(listener);
  }

  async init(server: Server) {
    log.debug(`init`);
    assert(server);

    if (this._initialized) {
      return Promise.reject(new Error('Already initialized'));
    }

    if (this._initializing) {
      return Promise.reject(new Error('Already initializing'));
    }

    this._initializing = true;
    log.info('Initializing config service');

    wifi.addListener(`online`, () => this._onWifiStateChange(`online`));
    wifi.addListener(`offline`, () => this._onWifiStateChange(`offline`));
    wifi.addListener(`stateChange`, (state) => this._onWifiStateChange(state));
    wifi.addListener(`scanResults`,
                     (scanResults) => this._onWifiScanResults(scanResults));
    wifi.addListener(`error`, (error) => this._onWifiError(error));

    server.addListener(`connecting`,
                       () => this._onServerStateChange(`connecting`));
    server.addListener(`reconnecting`,
                       () => this._onServerStateChange(`reconnecting`));
    server.addListener(`connect`,
                       () => this._onServerStateChange(`connected`));
    server.addListener(`disconnect`,
                       () => this._onServerStateChange(`disconnected`));
    server.addListener(`error`, (error) => this._onServerError(error));

    let [ deviceId, btle ] = await Promise.all([
      getDeviceId(),
      getBTLE(),
      this._loadConfig(),
    ]);

    assert(deviceId);
    assert(btle);
    assert(btle.mode === btle.MODE_OFF);

    this._deviceId = deviceId.pub;
    api.accessToken = deviceId;
    this._btle = btle;
    this._server = server;

    this._btle.on(`socketSession`,
                  (socketSession) => this._onSocketSession(socketSession));
    this._btle.beaconInfo = this._getBeaconInfo();

    if (this._config && this._config.success) {
      log.info(`Already configured`, this._config);
      this._btle.publicKeys = [ this._config.registrarPublicKey ];

      this._setApiServerUrl();

      await this._btle.changeMode(this._btle.MODE_SCAN);
      this.emit('configured');

      server.addListener(`connect`, this._onConfiguredServerConnect);
      server.addListener(`disconnect`, this._onConfiguredServerDisconnect);
    } else {
      log.info(`Not yet configured`);
      this._config = null;

      // Ensure we don't have any stale state lying around...
      await Promise.all([
        wifi.forgetNetwork(),
        this._btle.changeMode(this._btle.MODE_SCAN),
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

    this._unconfigurePromise = this._unconfigure()
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
    return this._unconfigurePromise;
  }

  async _unconfigureNetwork() {
    log.info('Unconfigure network...');

    this._server.removeListener(`connect`, this._onConfiguredServerConnect);
    this._server.removeListener(`disconnect`,
                                this._onConfiguredServerDisconnect);

    if (this._server.connected) {
      this._server.disconnect();
      log.info('Unconfigure - Disconnected from server');
    }

    await wifi.forgetNetwork();
    log.info('Unconfigure - forgot network...');
  }

  async _unconfigureBTLE() {
    log.debug(`DeviceConfig._unconfigureBTLE()`);

    this._configuringSocketSessionListener = null;

    if (this._socketSessionListeners.length) {
      const existingListeners = this._socketSessionListeners;
      this._socketSessionListeners = [ ];

      for (let listener of existingListeners) {
        listener.disconnect();
      }
    }

    log.debug(`Turning off bluetooth`);
    await this._btle.changeMode(this._btle.MODE_OFF);

    const beaconInfo = this._getBeaconInfo();
    assert(beaconInfo === DeviceConfig.CONFIG_BEACON_INFO);

    this._btle.beaconInfo = beaconInfo;
    this._btle.publicKeys = null;

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
