/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-multi-spaces */

import assert from 'assert';
import createLog from '../log';
import { EventEmitter } from 'events';
import server from '../server';
import wifi from '../wifi';

const log = createLog('config-session-listener-base');

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
  [ 'invalid_0',                      'wifi_error (0)' ],
  [ 'unspecified',                    'wifi_error (1)' ],
  [ 'prev_auth_not_valid',            'wifi_wrong_password (2)' ],
  [ 'deauth_leaving',                 'wifi_deauth_leaving (3)' ],
  [ 'disassoc_due_to_inactivity',     'wifi_disassoc_due_to_inactivity (4)' ],
  [ 'disassoc_ap_busy',               'wifi_disassoc_ap_busy (5)' ],
  [ 'class2_frame_from_nonauth_sta',  'wifi_class2_frame_from_nonauth_sta (6)' ],
  [ 'class3_frame_from_nonassoc_sta', 'wifi_class3_frame_from_nonassoc_sta (7)' ],
  [ 'disassoc_sta_has_left',          'wifi_disassoc_sta_has_left (8)' ],
  [ 'sta_req_assoc_without_auth',     'wifi_sta_req_assoc_without_auth (9)' ],
  [ 'pwr_capability_not_valid',       'wifi_pwr_capability_not_valid (10)' ],
  [ 'supported_channel_not_valid',    'wifi_supported_channel_not_valid (11)' ],
  [ 'invalid_12',                     'wifi_error (12)' ],
  [ 'invalid_ie',                     'wifi_error (13)' ],
  [ 'michael_mic_failure',            'wifi_michael_mic_failure (14)' ],
  [ '4way_handshake_timeout',         'wifi_wrong_password (15)' ],
  [ 'group_key_update_timeout',       'wifi_group_key_update_timeout (16)' ],
  [ 'ie_in_4way_differs',             'wifi_ie_in_4way_differs (17)' ],
  [ 'group_cipher_not_valid',         'wifi_group_cipher_not_valid (18)' ],
  [ 'pairwise_cipher_not_valid',      'wifi_pairwise_cipher_not_valid (19)' ],
  [ 'akmp_not_valid',                 'wifi_akmp_not_valid (20)' ],
  [ 'unsupported_rsn_ie_version',     'wifi_unsupported_rsn_ie_version (21)'],
  [ 'invalid_rsn_ie_capab',           'wifi_invalid_rsn_ie_capab (22)' ],
  [ 'ieee_802_1x_auth_failed',        'wifi_ieee_802_1x_auth_failed (23)' ],
  [ 'cipher_suite_rejected',          'wifi_cipher_suite_rejected (24)' ],
  [ 'tdls_teardown_unreachable',      'wifi_tdls_teardown_unreachable (25)' ],
  [ 'tdls_teardown_unspecified',      'wifi_tdls_teardown_unspecified (26)' ],
  [ 'invalid_27',                     'wifi_error (27)' ],
  [ 'invalid_28',                     'wifi_error (28)' ],
  [ 'invalid_29',                     'wifi_error (29)' ],
  [ 'invalid_30',                     'wifi_error (30)' ],
  [ 'invalid_31',                     'wifi_error (31)' ],
  [ 'invalid_32',                     'wifi_error (32)' ],
  [ 'invalid_33',                     'wifi_error (33)' ],
  [ 'disassoc_low_ack',               'wifi_disassoc_low_ack (34)' ],
]);

// maps server states to a connection status string that is sent to the app
const SERVER_STATE_MAP = new Map([
  [ 'connecting', 'server_connecting' ],
  [ 'connected', 'server_connected' ],
  [ 'disconnected', 'server_disconnected' ],
  [ 'reconnecting', 'server_reconnecting' ],
]);

export default class SessionListenerBase extends EventEmitter {
  static WIFI_STATE_MAP = WIFI_STATE_MAP;
  static WIFI_ERROR_MAP = WIFI_ERROR_MAP;
  static SERVER_STATE_MAP = SERVER_STATE_MAP;
  static ERROR_CODE_MAP = new Map(WIFI_ERROR_MAP);

  _deviceConfig = null;
  _socketSession = null;
  _disconnecting = false;
  _addStatusListeners = null;
  _removeStatusListeners = null;
  _statusListenersInstalled = false;
  _removeSessionListeners = null;
  _status = '';
  _errorCode = '';

  constructor(deviceConfig) {
    log.debug(`SessionListenerBase()`);

    assert(deviceConfig);

    super();

    this._deviceConfig = deviceConfig;

    this.addListener(`connect`,
                     socketSession => this._onConnect(socketSession));
    this.addListener(`disconnect`,
                     socketSession => this._onDisconnect(socketSession));

    const wifiOnlineListener = () => this._onWifiOnline();
    const wifiOfflineListener = () => this._onWifiOffline();
    const wifiStateChangeListener = state => this._onWifiStateChange(state);
    const wifiErrorListener = error => this._onWifiError(error);
    const serverConnectingListener = () => this._onServerConnecting();
    const serverReconnectingListener = () => this._onServerReconnecting();
    const serverConnectListener = () => this._onServerConnect();
    const serverDisconnectListener = () => this._onServerDisconnect();
    const serverStateChangeListener = state => this._onServerStateChange(state);
    const serverErrorListener = error => this._onServerError(error);

    this._addStatusListeners = () => {
      if (this._statusListenersInstalled) {
        return;
      }
      this._statusListenersInstalled = true;

      wifi.addListener(`online`, wifiOnlineListener);
      wifi.addListener(`offline`, wifiOfflineListener);
      wifi.addListener(`stateChange`, wifiStateChangeListener);
      wifi.addListener(`error`, wifiErrorListener);
      server.addListener(`connecting`, serverConnectingListener);
      server.addListener(`reconnecting`, serverReconnectingListener);
      server.addListener(`connect`, serverConnectListener);
      server.addListener(`disconnect`, serverDisconnectListener);
      server.addListener(`stateChange`, serverStateChangeListener);
      server.addListener(`error`, serverErrorListener);
    };

    this._removeStatusListeners = () => {
      if (!this._statusListenersInstalled) {
        return;
      }
      this._statusListenersInstalled = false;

      wifi.removeListener(`online`, wifiOnlineListener);
      wifi.removeListener(`offline`, wifiOfflineListener);
      wifi.removeListener(`stateChange`, wifiStateChangeListener);
      wifi.removeListener(`error`, wifiErrorListener);
      server.removeListener(`connecting`, serverConnectingListener);
      server.removeListener(`reconnecting`, serverReconnectingListener);
      server.removeListener(`connect`, serverConnectListener);
      server.removeListener(`disconnect`, serverDisconnectListener);
      server.removeListener(`stateChange`, serverStateChangeListener);
      server.removeListener(`error`, serverErrorListener);
    };
  }

  addStatusListeners() {
    log.debug(`SessionListenerBase.addStatusListeners()`);

    this._addStatusListeners();
  }

  removeStatusListeners() {
    log.debug(`SessionListenerBase.removeStatusListeners()`);

    this._removeStatusListeners();
  }

  disconnect() {
    log.debug(`SessionListenerBase.disconnect()`);

    if (this._disconnecting) {
      return;
    }

    this._disconnecting = true;

    this.removeStatusListeners();

    if (this._socketSession) {
      this._socketSession.rssiUpdatesEnabled = false;
      this._socketSession.end();
      this._socketSession = null;
    }
  }

  _send(data) {
    log.debug(`SessionListenerBase._send(%j)`, data);

    if (!this._socketSession) {
      log.warn(`Unable to send because socketSession has already disconnected`,
               data);
      return;
    }

    this._socketSession.write(data);
  }

  _sendStatus(status, force = false) {
    if (this._status === status && !force) {
      return;
    }
    this._status = status;
    this._send({
      name: `status`,
      status,
    });
  }

  _sendError(code, force = false) {
    if (this._errorCode === code && !force) {
      return;
    }
    this._errorCode = code;
    this._send({
      name: `error`,
      code,
    });
  }

  _onConnect(socketSession) {
    log.debug(`SessionListenerBase._onConnect()`);

    assert(!this._socketSession);

    const sessionErrorListener = error => this._onError(error);
    socketSession.addListener(`error`, sessionErrorListener);
    const sessionDataListener = data => this._onData(data);
    socketSession.addListener(`data`, sessionDataListener);
    const sessionRssiListener = rssi => this._onRssiUpdate(rssi);
    socketSession.addListener(`rssiUpdate`, sessionRssiListener);

    this._removeSessionListeners = () => {
      socketSession.removeListener(`error`, sessionErrorListener);
      socketSession.removeListener(`data`, sessionDataListener);
      socketSession.removeListener(`rssiUpdate`, sessionRssiListener);
    };

    this._socketSession = socketSession;

    this._send({
      name: `id`,
      // TODO: Something real here.
      manufacturer: `Silk Labs`,
      model: `SilkCam`,
      version: `0.0.1`,
      image: new Uint8Array([ 0xfe, 0xfe, 0xfe, 0xfe ]),
    });
  }

  _onDisconnect(socketSession) {
    log.debug(`SessionListenerBase._onDisconnect()`);

    if (this._socketSession) {
      assert(this._socketSession === socketSession);

      this._removeSessionListeners();
      this._socketSession = null;
    }

    assert(!this._statusListenersInstalled);
    this._status = '';
    this._errorCode = '';
    this._disconnecting = false;
  }

  _onError(error) {
    log.debug(`SessionListenerBase._onError()`);

    log.warn(`Session error, disconnecting`, error.stack);
    this.disconnect();
  }

  _onWifiOnline() {
    this._onWifiStateChange(`online`);
  }

  _onWifiOffline() {
    this._onWifiStateChange(`offline`);
  }

  _onWifiStateChange(state) {
    log.debug(`SessionListenerBase._onWifiStateChange('${state}')`);

    let status = SessionListenerBase.WIFI_STATE_MAP.get(state);
    if (!status) {
      log.error(`No status mapping for wifi state '${state}'`);
      status = `wifi_${state}`;
    }

    this._sendStatus(status);
  }

  _onWifiError(error) {
    error = error.toString();
    log.debug(`SessionListenerBase._onWifiError('${error}')`);

    let message = SessionListenerBase.WIFI_ERROR_MAP.get(error);
    if (!message) {
      log.error(`No error message mapping for wifi error '${error}'`);
      message = error;
    }

    this._sendStatus(message);
  }

  _onServerConnecting() {
    this._onServerStateChange(`connecting`);
  }

  _onServerConnect() {
    this._onServerStateChange(`connected`);
  }

  _onServerDisconnect() {
    this._onServerStateChange(`disconnected`);
  }

  _onServerReconnecting() {
    this._onServerStateChange(`reconnecting`);
  }

  _onServerStateChange(state) {
    log.debug(`SessionListenerBase._onServerStateChange('${state}')`);

    let status = SessionListenerBase.SERVER_STATE_MAP.get(state);
    if (!status) {
      log.error(`No status mapping for server state '${state}'`);
      status = `server_${state}`;
    }

    if (wifi.isOnline()) {
      this._sendStatus(status);
    }
  }

  _onServerError(error) {
    let message = error.toString();
    log.debug(`SessionListenerBase._onServerError('${message}')`);

    this._sendStatus(message);
  }

  _onData(/* data */) {
    throw new Error(`Subclasses must override _onData`);
  }

  _onRssiUpdate(/* rssi */) {
    throw new Error(`Subclasses must override _onRssiUpdate`);
  }
}
