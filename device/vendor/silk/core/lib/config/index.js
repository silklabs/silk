/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import invariant from 'assert';
import {EventEmitter} from 'events';
import fs from 'mz/fs';
import * as Joi from 'joi';
import {BTLE_SOCKET_UUIDS} from 'silk-api';
import {createDeferred} from 'silk-async-utils';
import * as util from 'silk-sysutils';
import wifi from 'silk-wifi';

import api from 'silk-device-api';
import ConfigSessionListener from './config_session_listener';
import createLog from 'silk-log/device';
import getBTLE from '../btle/parent';
import getDeviceId from '../deviceid';
import NormalSessionListener from './normal_session_listener';
import type {default as Connections, ConnectionsState} from '../connections';

import type {
  ScanResult,
  WifiDisconnectReason,
  WifiState,
} from 'silk-wifi';

import type SessionListenerBase from './session_listener_base';
import type {
  AdvertisingInfo,
  BluetoothLE,
} from '../btle/parent';
import type ParentSocketSession from '../btle/parent_socket_session';

export type ConfigData = {
  registrarPublicKey: string;
  registrationToken: string;
  success: boolean;

  // Only present when |success| is true.
  beaconUUID?: string;
  accountDeviceNumber?: number;

  // Not always present.
  serverUrl?: string;
};

export type Secret = {
  accessPoint: string;
  password: ?string;
  publicKey: string;
  regToken: string;
  serverUrl: string;
};

type AugmentedWifiState =
  WifiState |
  // This value is emitted by WpaMonitor manually as it initializes the DHCP
  // process.
  'dhcping' |
  // These two values correspond to the 'online' and 'offline' events of
  // WpaMonitor and represent the overall state of the internet uplink.
  'online' |
  'offline';

type Status = AugmentedWifiState | ConnectionsState;


const log = createLog('config');

const CONFIG_PATH = 'data/silk/config/config.json';

const CONFIG_ADVERTISING_INFO: AdvertisingInfo = {
  uuid: BTLE_SOCKET_UUIDS.service,
  id: 0,
};

const REGISTRATION_TIMEOUT_MS: number = 3 * 1000;
const REGISTRATION_RETRY_LIMIT: number = 5;

const REGISTRATION_RESPONSE_SCHEMA = Joi.object().keys({
  success: Joi.boolean().required(),
  beaconUUID: Joi.any().when(`success`, {
    is: true,
    then: Joi.string().guid().required(),
    otherwise: Joi.string().optional(),
  }),
  accountDeviceNumber: Joi.any().when(`success`, {
    is: true,
    then: Joi.number().integer().min(1).max(65535).required(),
    otherwise: Joi.string().optional(),
  }),
}).required();

// maps wifi states to a connection status string that is sent to the app
const WIFI_STATE_MAP: Map<AugmentedWifiState, string> = new Map([
  [ 'scanning', 'wifi_scanning' ],
  [ 'associating', 'wifi_associating' ],
  [ 'associated', 'wifi_associated' ],
  [ 'four_way_handshake', 'wifi_authenticating' ],
  [ 'group_handshake', 'wifi_authenticating' ],
  [ 'completed', 'wifi_connected' ],
  [ 'dhcping', 'wifi_dhcping' ],
  [ 'online', 'wifi_online' ],
  [ 'offline', 'wifi_offline' ],
]);

// maps wifi errors to a connection status string that is sent to the app
const WIFI_ERROR_MAP: Map<WifiDisconnectReason, string> = new Map([
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
const SERVER_STATE_MAP: Map<ConnectionsState, string> = new Map([
  [ 'connecting', 'server_connecting' ],
  [ 'connected', 'server_connected' ],
  [ 'disconnected', 'server_disconnected' ],
  [ 'reconnecting', 'server_reconnecting' ],
]);

/**
 *
 */
export class DeviceConfig extends EventEmitter {

  _initialized: boolean = false;
  _initializing: boolean = false;
  _deviceId: string = ``;
  _btle: ?BluetoothLE = null;
  _wifiAbortConnection: ?((error: Error) => void) = null;
  _unconfigurePromise: ?Promise<void> = null;
  _config: ?ConfigData = null;
  _serverConnected: boolean = false;
  _server: Connections = null;
  _socketSessionListeners: Array<SessionListenerBase> = [ ];
  _configuringSocketSessionListener: ?ConfigSessionListener = null;
  _sessionStatus: Status = ``;
  _sessionErrorCode: string = ``;
  _lastWifiScanResults: ?Array<ScanResult> = null;

  async _writeConfig(config: ConfigData): Promise<void> {
    log.info('Writing config file', CONFIG_PATH, config);
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config));
    log.debug('Finished writing config file');
  }

  /**
   * Persist the configuration after the device has completed registration.
   * @private
   */
  async _persistConfig(secret: Secret, response?: Object = { }): Promise<void> {
    const config: ConfigData = {
      registrarPublicKey: secret.publicKey,
      registrationToken: secret.regToken,
      serverUrl: secret.serverUrl,
      ...response,
    };

    await this._writeConfig(config);
    this._config = config;
  }

  async _loadConfig(): Promise<void> {
    if (!await fs.exists(CONFIG_PATH)) {
      return;
    }
    try {
      this._config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
    } catch (error) {
      log.warn(`Failed to parse config, removing`, error);
      await fs.unlink(CONFIG_PATH);
      this._config = null;
    }
  }

  _beginConfigure(sessionListener: ConfigSessionListener): void {
    log.debug(`DeviceConfig._beginConfigure()`);

    invariant(!this._config);
    invariant(!this._configuringSocketSessionListener);
    invariant(this._socketSessionListeners.length);

    this.emit('configStarted');

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
      invariant(this._socketSessionListeners[0] === sessionListener);
    }

    // Send wifi scan results now if we have them.
    if (this._lastWifiScanResults) {
      sessionListener.sendWifiScanResults(this._lastWifiScanResults);
    }
  }

  _cancelConfigure(): void {
    log.debug(`DeviceConfig._cancelConfigure()`);

    invariant(this._configuringSocketSessionListener);
    this._configuringSocketSessionListener = null;

    if (!this._config || !this._config.success) {
      this.emit('unconfigured');
    }
  }

  async _registerDevice(
    secret: Secret,
    timeoutMS?: number = REGISTRATION_TIMEOUT_MS,
    max?: number = REGISTRATION_RETRY_LIMIT,
    retry?: number = 0,
  ): Promise<Object> {
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

  _onConfigured: ((secret: Secret) => Promise<void>) = async (secret) => {
    log.debug(`DeviceConfig._onConfigured()`);

    this.emit('configRegistering');

    invariant(this._configuringSocketSessionListener);
    invariant(secret.publicKey);
    invariant(secret.regToken);

    // Only accept the server URL from the app in development.  In production
    // the server URL is locked to avoid the potential of device
    // hijacking
    if (!util.getboolprop('ro.debuggable')) {
      delete secret.serverUrl;
    }
    this._setApiServerUrl(secret.serverUrl);

    try {
      await this.connectToWifi(secret.accessPoint, secret.password);

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

      invariant(response);

      if (!response.success) {
        throw new Error(`Failed to register device for known reason`);
      }

      log.info('Registration complete', response);

      // Update the config on disk with the response so that we know we are
      // completely registered.
      await this._persistConfig(secret, response);
    } catch (error) {
      log.warn('Failed to register device', error);
      this.stopRetryingWifiConnection(error);

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
        this.emit('configStarted');
      }
      return;
    }

    invariant(!this._wifiAbortConnection);
    invariant(this._configuringSocketSessionListener);

    this._configuringSocketSessionListener.sendComplete();

    log.info('Configured');
    this.emit('configured');
  };

  async _onDismissed(): Promise<void> {
    log.debug(`DeviceConfig._onDismissed()`);

    invariant(this._configuringSocketSessionListener);
    this._configuringSocketSessionListener.disconnect();
    this._configuringSocketSessionListener = null;

    log.debug(`Turning off bluetooth`);

    const btle = this._btle;
    invariant(btle);

    await btle.changeMode('off');

    invariant(this._config);
    btle.publicKeys = [this._config.registrarPublicKey];

    btle.advertisingInfo = this._getAdvertisingInfo();

    this._server.addListener(`connect`, this._onConfiguredServerConnect);
    this._server.addListener(`disconnect`, this._onConfiguredServerDisconnect);

    log.debug(`Turning bluetooth back on`);
    await btle.changeMode('on');
  }

  _onConfiguredServerConnect: (() => Promise<void>) = async () => {
    log.debug(`DeviceConfig._onConfiguredServerConnect()`);

    invariant(this._config);
    invariant(this._config.beaconUUID);
    invariant(!this._serverConnected);

    this._serverConnected = true;

    if (this._socketSessionListeners.length) {
      let existingListeners = this._socketSessionListeners;
      this._socketSessionListeners = [ ];

      for (let listener of existingListeners) {
        listener.disconnect();
      }
    }

    invariant(this._btle);
    await this._btle.changeMode('on');
  };

  _onConfiguredServerDisconnect: (() => Promise<void>) = async () => {
    log.debug(`DeviceConfig._onConfiguredServerDisconnect()`);

    invariant(this._config);
    invariant(this._config.beaconUUID);

    this._serverConnected = false;

    invariant(this._btle);
    await this._btle.changeMode('beacon');
  };

  _getAdvertisingInfo(): AdvertisingInfo {
    if (this._config && this._config.success) {
      const {beaconUUID, accountDeviceNumber} = this._config;
      invariant(beaconUUID);

      log.debug(`Returning advertising uuid '${String(beaconUUID)}'`);
      return {
        uuid: beaconUUID,
        id: accountDeviceNumber || 0,
      };
    }

    log.debug(`Returning config advertising uuid ` +
              `'${String(CONFIG_ADVERTISING_INFO.uuid)}'`);
    return CONFIG_ADVERTISING_INFO;
  }

  /*
   Sets the server URL used by the API.

   If serverUrl is null, try the URL persisted in the device configuration first
   then fall back to the default URL in the API itself
  */
  _setApiServerUrl(serverUrl?: string): void {
    if (!serverUrl) {
      if (this._config && this._config.success) {
        serverUrl = this._config.serverUrl;
      }
    }
    log.info(`api serverUrl: ${String(serverUrl)}`);
    api.loadConfig({serverUrl: serverUrl});
  }

  _nofityListenersOfStatus(status: string): void {
    log.debug(`DeviceConfig._nofityListenersOfStatus('${status}')`);

    if (this._sessionStatus === status) {
      return;
    }

    this._sessionStatus = status;

    if (this._configuringSocketSessionListener) {
      invariant(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendStatus(status);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendStatus(status);
      }
    }
  }

  _onWifiStateChange(state: AugmentedWifiState): void {
    log.debug(`DeviceConfig._onWifiStateChange('${state}')`);

    let status = WIFI_STATE_MAP.get(state);
    if (!status) {
      log.error(`No status mapping for wifi state '${state}'`);
      status = `wifi_${state}`;
    }

    this._nofityListenersOfStatus(status);
  }

  _onWifiScanResults(scanResults: Array<ScanResult>): void {
    log.debug(`DeviceConfig._onWifiScanResults()`);

    this._lastWifiScanResults = scanResults;

    if (this._configuringSocketSessionListener) {
      invariant(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendWifiScanResults(scanResults);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendWifiScanResults(scanResults);
      }
    }
  }

  _onWifiError(error: Error): void {
    log.debug(`DeviceConfig._onWifiError()`, error);

    // $FlowFixMe: There's no good way to tell Flow that this is ok.
    let status = WIFI_ERROR_MAP.get(error.message);
    if (!status) {
      log.error(`No error code mapping for wifi error`, error);
      status = error.message;
    }

    this._nofityListenersOfStatus(status);

    // Special hook for wifi failures during configure.
    if (this._configuringSocketSessionListener) {
      this._configuringSocketSessionListener.onWifiError(status);
    }
  }

  _onServerStateChange(state: ConnectionsState): void {
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

  _onServerError(error: Error): void {
    log.debug(`DeviceConfig._onServerError()`, error);

    // XXX Need some mappings here someday.
    const status = error.message;

    this._nofityListenersOfStatus(status);
  }

  _onSocketSession(socketSession: ParentSocketSession): void {
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

  async init(server: Connections): Promise<void> {
    log.debug(`init`);
    invariant(server);

    if (this._initialized) {
      throw new Error('Already initialized');
    }

    if (this._initializing) {
      throw new Error('Already initializing');
    }

    this._initializing = true;
    log.info('Initializing config service');

    if (wifi.isOnline()) {
      this._onWifiStateChange(`online`);
    } else {
      this._onWifiStateChange(wifi.state);
    }
    wifi.addListener(`online`, () => this._onWifiStateChange(`online`));
    wifi.addListener(`offline`, () => this._onWifiStateChange(`offline`));
    wifi.addListener(`stateChange`, (state) => this._onWifiStateChange(state));
    wifi.addListener(`scanResults`,
                     (scanResults) => this._onWifiScanResults(scanResults));
    wifi.addListener(`error`, (error) => this._onWifiError(error));

    this._onServerStateChange(server.state);
    server.addListener(`stateChange`, state => this._onServerStateChange(state));
    server.addListener(`error`, (error) => this._onServerError(error));

    let [ deviceId, btle ] = await Promise.all([
      getDeviceId(),
      getBTLE(),
      this._loadConfig(),
    ]);

    const config = this._config;

    invariant(deviceId);
    invariant(btle);
    invariant(btle.mode === btle.MODE_OFF);

    this._deviceId = deviceId.pub;
    api.accessToken = deviceId;
    this._btle = btle;
    this._server = server;

    btle.on(`socketSession`,
            (socketSession) => this._onSocketSession(socketSession));
    btle.advertisingInfo = this._getAdvertisingInfo();

    if (config && config.success) {

      log.info(`Already configured`, config);
      btle.publicKeys = [ config.registrarPublicKey ];

      this._setApiServerUrl();

      await btle.changeMode('beacon');
      this.emit('configured');

      server.addListener(`connect`, this._onConfiguredServerConnect);
      server.addListener(`disconnect`, this._onConfiguredServerDisconnect);
    } else {
      log.info(`Not yet configured`);
      this._config = null;

      // Ensure we don't have any stale state lying around...
      await Promise.all([
        wifi.forgetNetwork(),
        btle.changeMode('beacon'),
      ]);

      this.emit('unconfigured');
    }

    this._initializing = false;
    this._initialized = true;
  }

  unconfigure(): Promise<void> {
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

  async _unconfigureNetwork(): Promise<void> {
    log.info('Unconfigure network...');

    this._server.removeListener(`connect`, this._onConfiguredServerConnect);
    this._server.removeListener(`disconnect`,
                                this._onConfiguredServerDisconnect);

    if (this._server.connected) {
      this._server.stop();
      log.info('Unconfigure - Disconnected from server');
    }

    await wifi.forgetNetwork();
    log.info('Unconfigure - forgot network...');
  }

  async _unconfigureBTLE(): Promise<void> {
    log.debug(`DeviceConfig._unconfigureBTLE()`);

    this._configuringSocketSessionListener = null;

    if (this._socketSessionListeners.length) {
      const existingListeners = this._socketSessionListeners;
      this._socketSessionListeners = [ ];

      for (let listener of existingListeners) {
        listener.disconnect();
      }
    }

    const btle = this._btle;
    invariant(btle);

    log.debug(`Turning off bluetooth`);
    await btle.changeMode('off');

    const advertisingInfo = this._getAdvertisingInfo();
    invariant(advertisingInfo === CONFIG_ADVERTISING_INFO);

    btle.advertisingInfo = advertisingInfo;
    btle.publicKeys = [];

    log.debug(`Turning bluetooth back on`);
    await btle.changeMode('beacon');
  }

  async _unconfigure(): Promise<void> {
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
      this._unconfigureNetwork(),
    ]);
  }

  /**
   * Clear the server URL received from the app during device configuration.
   */
  async forceDefaultServerUrl(): Promise<void> {
    if (this._config && this._config.serverUrl) {
      delete this._config.serverUrl;
      await this._writeConfig(this._config);
    }
  }

  /**
   * Connects to a particular wifi network and doesn't resolve until that wifi
   * network has been successfully connected. Can be canceled via
   * |stopRetryingWifiConnection()|.
   */
  async connectToWifi(accessPoint: string, password: ?string): Promise<void> {
    log.debug(`DeviceConfig.connectToWifi()`,
              accessPoint,
              password ? `(${password.length})` : password);

    log.debug(`Forgetting previous network`);
    await wifi.forgetNetwork();

    log.debug(`Joining '${accessPoint}'`);
    await wifi.joinNetwork(accessPoint, password);

    // |wifi.joinNetwork()| resolves as soon as it has issued the commands to
    // the wpa supplicant. It then tries to connect to the network over and
    // over again even if such attempts are futile (e.g. the password is
    // incorrect). We don't want to wait forever for the 'online' event below
    // if we're in one of these loops, so we need a mechanism to break out of
    // the connection loop. To do that we establish a deferred that we can
    // reject after a few failed attempts, and then race with that deferred.
    // The session listeners may reject the deferred by calling
    // |_stopRetryingWifiConnection|, but the deferred is never accepted.
    const deferred = createDeferred();

    invariant(!this._wifiAbortConnection);
    this._wifiAbortConnection = deferred.reject;

    log.info(`Connecting to '${accessPoint}'`);

    await Promise.race([
      // Race between a successful wifi connection...
      wifi.online(),

      // ...and the deferred rejection if we need to break out of a connection
      // loop.
      deferred.promise,
    ]);

    invariant(this._wifiAbortConnection);
    this._wifiAbortConnection = null;
  }

  /**
   * Cancel wifi connection with the given error.
   */
  stopRetryingWifiConnection(error: Error): void {
    const abort = this._wifiAbortConnection;
    if (!abort) {
      log.warn(`Unable to reject wifi connection promise`, error);
      return;
    }

    log.debug(`Rejecting wifi connection promise`, error);
    this._wifiAbortConnection = null;
    abort(error);
  }

  scanWifi(): void {
    log.debug(`DeviceConfig.scanWifi()`);

    wifi.scan();
  }
}

export default new DeviceConfig();
