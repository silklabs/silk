/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import invariant from 'assert';
import EventEmitter from 'events';
import getUpdateEmitter from 'silk-update';
import * as Joi from 'joi';
import {BTLE_SOCKET_UUIDS} from 'silk-api';
import {createDeferred} from 'silk-async-utils';
import * as util from 'silk-sysutils';
import wifi from 'silk-wifi';
import api from 'silk-device-api';
import createLog from 'silk-log/device';

import ConfigSessionListener from './config_session_listener';
import NormalSessionListener from './normal_session_listener';
import getDeviceId from '../deviceid';
import getPermissionManager from '../permissions';
import getStore from '../store';
import getBTLE from '../btle/parent';
import actions from '../store/actions';

import type {StatusEvent as UpdateStatusEvent} from 'silk-update';
import type {
  ScanResult,
  WifiDisconnectReason,
  WifiState,
} from 'silk-wifi';

import type SessionListenerBase from './session_listener_base';
import type {
  default as Connections,
  ConnectionsState,
} from '../connections';
import type {PermissionManagerConnection} from '../permissions';
import type {
  AdvertisingInfo,
  BluetoothLE,
} from '../btle/parent';
import type ParentSocketSession from '../btle/parent_socket_session';

export type Secret = {
  accessPoint: string;
  password: ?string;
  publicKey: string;
  regToken: string;
  serverUrl: string;
};

export type ConfigData = {
  beaconUuid: string;
  deviceNumber: number;
  registrarPublicKey: string;
  serverUrl: string;
};

export type ConnectionType = 'wifi' | 'server';

type AugmentedWifiState =
  WifiState |
  // This value is emitted by WpaMonitor manually as it initializes the DHCP
  // process.
  'dhcping' |
  // These two values correspond to the 'online' and 'offline' events of
  // WpaMonitor and represent the overall state of the internet uplink.
  'online' |
  'offline';

const log = createLog('config');

const CONFIG_ADVERTISING_INFO: AdvertisingInfo = {
  uuid: BTLE_SOCKET_UUIDS.service,
  id: 0,
};

const REGISTRATION_TIMEOUT_MS: number = 3 * 1000;
const REGISTRATION_RETRY_LIMIT: number = 5;

const NEW_PAIRED_DEVICE_PERMISSIONS = [
  'ble',
  'revoke',
  'rtc',
  'reset',
];

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

// Maps wifi states to custom status codes.
const WIFI_STATE_MAP: Map<AugmentedWifiState, string> = new Map([
  [ 'four_way_handshake', 'authenticating' ],
  [ 'group_handshake', 'authenticating' ],
  [ 'completed', 'connected' ],
]);

// Maps wifi errors to custom error codes.
const WIFI_ERROR_MAP: Map<WifiDisconnectReason, string> = new Map([
  [ 'unspecified', 'error (0)' ],
  [ 'invalid_0', 'error (1)' ],
  [ 'invalid_12', 'error (2)' ],
  [ 'invalid_ie', 'error (3)' ],
  [ 'invalid_27', 'error (4)' ],
  [ 'invalid_28', 'error (5)' ],
  [ 'invalid_29', 'error (6)' ],
  [ 'invalid_30', 'error (7)' ],
  [ 'invalid_31', 'error (8)' ],
  [ 'invalid_32', 'error (9)' ],
  [ 'invalid_33', 'error (10)' ],
  [ 'prev_auth_not_valid', 'wrong_password (0)' ],
  [ '4way_handshake_timeout', 'wrong_password (1)' ],
]);

// Maps server states to custom status codes.
const SERVER_STATE_MAP: Map<ConnectionsState, string> = new Map();

// Maps server errors to custom error codes.
const SERVER_ERROR_MAP: Map<string, string> = new Map();

function getConfig() {
  return getStore().getState().persist.config;
}

/**
 *
 */
export class DeviceConfig extends EventEmitter {

  _initialized: boolean = false;
  _initializing: boolean = false;
  _deviceId: ?string = null;
  _btle: ?BluetoothLE = null;
  _wifiAbortConnection: ?((error: Error) => void) = null;
  _unconfigurePromise: ?Promise<void> = null;
  _serverConnected: boolean = false;
  _server: Connections = null;
  _socketSessionListeners: Array<SessionListenerBase> = [ ];
  _configuringSocketSessionListener: ?ConfigSessionListener = null;
  _sessionStatus: Map<ConnectionType, string> = new Map();
  _sessionErrorMessages: Map<ConnectionType, string> = new Map();
  _lastWifiScanResults: ?Array<ScanResult> = null;
  _lastUpdateEvent: ?UpdateStatusEvent = null;
  _permissionManager: ?PermissionManagerConnection = null;

  _setBtlePublicKeys(): void {
    const btle = this._btle;
    invariant(btle);

    const permissionManager = this._permissionManager;
    invariant(permissionManager);

    const paired = permissionManager.match('ble');
    const pairedSet = new Set(paired);

    const unpaired =
      permissionManager.match('ble-temp').filter((key) => !pairedSet.has(key));

    btle.setPublicKeys(paired, unpaired);
  }

  _beginConfigure(sessionListener: ConfigSessionListener): void {
    log.debug(`DeviceConfig._beginConfigure()`);

    invariant(!getConfig());
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

    if (!getConfig()) {
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

      const data: ConfigData = {
        beaconUuid: response.beaconUUID,
        deviceNumber: response.accountDeviceNumber,
        registrarPublicKey: secret.publicKey,
        serverUrl: secret.serverUrl || null,
      };

      // Update the config on disk with the response so that we know we are
      // completely registered.
      getStore().dispatch(actions.persist.configure(data));
    } catch (error) {
      log.warn('Failed to register device', error);
      this.stopRetryingWifiConnection(error);

      await this._unconfigureNetwork();

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

    const {accountDeviceNumber} = getConfig();
    invariant(accountDeviceNumber);

    this._configuringSocketSessionListener.sendComplete(accountDeviceNumber);

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

    this._setBtlePublicKeys();
    btle.advertisingInfo = this._getAdvertisingInfo();

    this._server.addListener(`connect`, this._onConfiguredServerConnect);
    this._server.addListener(`disconnect`, this._onConfiguredServerDisconnect);

    log.debug(`Turning bluetooth back on`);
    await btle.changeMode('on');
  }

  _onConfiguredServerConnect: (() => Promise<void>) = async () => {
    log.debug(`DeviceConfig._onConfiguredServerConnect()`);

    invariant(getConfig());
    invariant(!this._serverConnected);

    this._serverConnected = true;

    invariant(this._btle);
    await this._btle.changeMode('on');
  };

  _onConfiguredServerDisconnect: (() => Promise<void>) = async () => {
    log.debug(`DeviceConfig._onConfiguredServerDisconnect()`);

    invariant(getConfig());

    this._serverConnected = false;

    invariant(this._btle);
    await this._btle.changeMode('beacon');
  };

  _getAdvertisingInfo(): AdvertisingInfo {
    const config = getConfig();
    if (config) {
      const {accountBeaconUuid, accountDeviceNumber} = config;
      invariant(accountBeaconUuid);

      log.debug(`Returning advertising uuid '${String(accountBeaconUuid)}'`);
      return {
        uuid: accountBeaconUuid,
        id: accountDeviceNumber,
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
    log.info(`api serverUrl: ${String(serverUrl)}`);
    api.loadConfig({serverUrl: serverUrl});
  }

  _notifyListenersOfStatus(type: ConnectionType, code: string): void {
    log.debug(`DeviceConfig._notifyListenersOfStatus('${type}', '${code}')`);

    if (this._sessionStatus.get(type) === code) {
      return;
    }
    this._sessionStatus.set(type, code);
    this._sessionErrorMessages.delete(type);

    if (this._configuringSocketSessionListener) {
      invariant(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendStatus(type, code);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendStatus(type, code);
      }
    }
  }

  _notifyListenersOfError(type: ConnectionType, code: string): void {
    log.debug(`DeviceConfig._notifyListenersOfError('${type}', '${code}')`);

    if (this._sessionErrorMessages.get(type) === code) {
      return;
    }
    this._sessionErrorMessages.set(type, code);

    if (this._configuringSocketSessionListener) {
      invariant(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendError(type, code);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendError(type, code);
      }
    }
  }

  _notifyListenersOfUpdateInfo(event: UpdateStatusEvent): void {
    log.debug(`DeviceConfig._notifyListenersOfUpdateInfo()`, event);

    if (this._lastUpdateEvent === event) {
      return;
    }
    this._lastUpdateEvent = event;

    if (this._configuringSocketSessionListener) {
      invariant(this._socketSessionListeners.length === 1);
      this._configuringSocketSessionListener.sendUpdateStatus(event);
    } else {
      for (let listener of this._socketSessionListeners) {
        listener.sendUpdateStatus(event);
      }
    }
  }

  _onWifiStateChange(state: AugmentedWifiState): void {
    log.debug(`DeviceConfig._onWifiStateChange('${state}')`);

    const status = WIFI_STATE_MAP.get(state) || state;
    this._notifyListenersOfStatus('wifi', status);
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
    const message = WIFI_ERROR_MAP.get(error.message) || error.message;
    this._notifyListenersOfError('wifi', message);

    // Special hook for wifi failures during configure.
    if (this._configuringSocketSessionListener) {
      this._configuringSocketSessionListener.onWifiError(message);
    }
  }

  _onServerStateChange(state: ConnectionsState): void {
    log.debug(`DeviceConfig._onServerStateChange('${state}')`);

    const status = SERVER_STATE_MAP.get(state) || state;
    this._notifyListenersOfStatus('server', status);
  }

  _onServerError(error: Error): void {
    log.debug(`DeviceConfig._onServerError()`, error);

    const code = SERVER_ERROR_MAP.get(error.message) || error.message;
    this._notifyListenersOfError('server', code);
  }

  _onSocketSession(socketSession: ParentSocketSession): void {
    log.debug(`DeviceConfig._onSocketSession()`);

    if (this._configuringSocketSessionListener) {
      log.info(`Ignoring socket session because another is configuring ` +
               `already`);
      socketSession.end();
      return;
    }

    let listener;
    if (getConfig()) {
      listener = new NormalSessionListener(this, socketSession);

      if (wifi.isOnline()) {
        wifi.getCurrentNetworkInfo().then((info) => {
          if (info && this._socketSessionListeners.indexOf(listener) !== -1) {
            listener.sendWifiConnectionInfo(info);
          }
        });
      }

      this._sessionStatus.forEach((status, type) => {
        listener.sendStatus(type, status);
      });
      this._sessionErrorMessages.forEach((message, type) => {
        listener.sendError(type, message);
      });
      if (this._lastUpdateInfo) {
        listener.sendUpdateStatus(this._lastUpdateInfo);
      }
    } else {
      listener = new ConfigSessionListener(this, socketSession);
    }

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

    this._permissionManager = getPermissionManager();
    this._permissionManager.on(`change`, () => {
      const btle = this._btle;
      if (!btle) {
        return;
      }
      this._setBtlePublicKeys();
    });

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

    const update = getUpdateEmitter();
    update.addListener(`status`,
                       (message) => this._notifyListenersOfUpdateInfo(message));

    const deviceId = getDeviceId();
    invariant(deviceId);

    const btle = await getBTLE();
    invariant(btle);
    invariant(btle.mode === btle.MODE_OFF);

    this._deviceId = deviceId.pub;
    api.accessToken = deviceId;
    this._btle = btle;
    this._server = server;

    btle.on(`socketSession`,
            (socketSession) => this._onSocketSession(socketSession));
    btle.advertisingInfo = this._getAdvertisingInfo();

    const config = getConfig();

    if (config) {
      log.info(`Already configured`, config);
      this._setBtlePublicKeys();

      this._setApiServerUrl(config.serverUrl);

      await btle.changeMode('beacon');
      this.emit('configured');

      server.addListener(`connect`, this._onConfiguredServerConnect);
      server.addListener(`disconnect`, this._onConfiguredServerDisconnect);
    } else {
      log.info(`Not yet configured`);

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
    this._setBtlePublicKeys();

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

    if (!getConfig()) {
      log.info('Device already unconfigured');
      return;
    }

    getStore().dispatch(actions.persist.unconfigure());

    // Unconfigure BTLE and our network setup...
    await Promise.all([
      this._unconfigureBTLE(),
      this._unconfigureNetwork(),
    ]);
  }

  _addPairedKey(publicKey: string) {
    log.debug(`DeviceConfig._addPairedKey(${publicKey})`);

    const permissionManager = this._permissionManager;
    invariant(permissionManager);

    const permissions = NEW_PAIRED_DEVICE_PERMISSIONS.map((permissionType) =>
      ({
        type: permissionType,
        expires: null,
        actor: null,
      })
    );

    permissionManager.add(publicKey, permissions);
  }

  /**
   * Clear the server URL received from the app during device configuration.
   */
  forceDefaultServerUrl() {
    if (getConfig()) {
      getStore().dispatch(actions.persist.forceDefaultServerUrl());
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

  async getWifiConnectionInfo(listener: SessionListenerBase): Promise<void> {
    log.debug(`DeviceConfig.getWifiInfo()`);

    if (!wifi.isOnline()) {
      log.warn(`Not online`);
      return;
    }

    const connectionInfo = await wifi.getCurrentNetworkInfo();
    if (!connectionInfo) {
      if (wifi.isOnline) {
        log.warn(`Failed to get connection info`);
      } else {
        log.warn(`No longer online`);
      }
      return;
    }

    log.debug(`Got connection info`, connectionInfo);

    if (this._socketSessionListeners.indexOf(listener) !== -1) {
      log.debug(`Sending connection info`);
      listener.sendWifiConnectionInfo(connectionInfo);
    }
  }

  get activeSessionCount(): number {
    return this._socketSessionListeners.length;
  }
}

export default new DeviceConfig();
