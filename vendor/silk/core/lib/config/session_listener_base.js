/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import createLog from '../log';
import { EventEmitter } from 'events';
import server from '../server';
import wifi from '../wifi';

const log = createLog('config-session-listener-base');

export default class SessionListenerBase extends EventEmitter {
  static WIFI_STATE_MAP = new Map([
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

  static WIFI_ERROR_MAP = new Map([
    [ '4way_handshake_timeout', 'wrong password' ],
  ]);

  static SERVER_STATE_MAP = new Map([
    [ 'connecting', 'server_connecting' ],
    [ 'connected', 'server_connected' ],
    [ 'disconnected', 'server_disconnected' ],
    [ 'reconnecting', 'server_reconnecting' ],
  ]);

  _socketSession = null;
  _disconnecting = false;
  _removeStatusListeners = null;
  _removeSessionListeners = null;
  _status = '';
  _error = '';

  constructor() {
    log.debug(`SessionListenerBase()`);

    super();

    this.addListener(`connect`,
                     socketSession => this._onConnect(socketSession));
    this.addListener(`disconnect`,
                     socketSession => this._onDisconnect(socketSession));

    const wifiOnlineListener = () => this._onWifiOnline();
    wifi.addListener(`online`, wifiOnlineListener);
    const wifiOfflineListener = () => this._onWifiOffline();
    wifi.addListener(`offline`, wifiOfflineListener);
    const wifiStateChangeListener = state => this._onWifiStateChange(state);
    wifi.addListener(`stateChange`, wifiStateChangeListener);
    const wifiErrorListener = error => this._onWifiError(error);
    wifi.addListener(`error`, wifiErrorListener);

    const serverConnectingListener = () => this._onServerConnecting();
    server.addListener(`connecting`, serverConnectingListener);
    const serverReconnectingListener = () => this._onServerReconnecting();
    server.addListener(`reconnecting`, serverReconnectingListener);
    const serverConnectListener = () => this._onServerConnect();
    server.addListener(`connect`, serverConnectListener);
    const serverDisconnectListener = () => this._onServerDisconnect();
    server.addListener(`disconnect`, serverDisconnectListener);
    const serverStateChangeListener = state => this._onServerStateChange(state);
    server.addListener(`stateChange`, serverStateChangeListener);
    const serverErrorListener = error => this._onServerError(error);
    server.addListener(`error`, serverErrorListener);

    this._removeStatusListeners = () => {
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

  removeStatusListeners() {
    log.debug(`SessionListenerBase.removeStatusListeners()`);

    if (this._removeStatusListeners) {
      this._removeStatusListeners();
      this._removeStatusListeners = null;
    }
  }

  disconnect() {
    log.debug(`SessionListenerBase.disconnect()`);

    if (this._disconnecting) {
      return;
    }

    this._disconnecting = true;

    if (this._socketSession) {
      this.removeStatusListeners();
      this._socketSession.rssiUpdatesEnabled = false;
      this._socketSession.disconnect();
    }
  }

  _send(data) {
    log.debug(`SessionListenerBase._send(%j)`, data);

    assert(this._socketSession);
    this._socketSession.write(data);
  }

  _sendStatus(status) {
    assert(this._socketSession);
    this._send({
      name: `status`,
      status
    });
  }

  _sendError(error) {
    assert(this._socketSession);
    this._send({
      name: `error`,
      error
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

  _onDisconnect = socketSession => {
    log.debug(`SessionListenerBase._onDisconnect()`);

    assert(this._socketSession);
    assert(this._socketSession === socketSession);

    this._removeSessionListeners();
    this._socketSession = null;
  }

  _onError(error) {
    log.debug(`SessionListenerBase._onError()`);

    log.warn(`Session error, disconnecting`, error);
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

    if (status !== this._status) {
      this._status = status;
      if (this._socketSession) {
        this._sendStatus(status);
      }
    }
  }

  _onWifiError(error) {
    error = error.toString();
    log.debug(`SessionListenerBase._onWifiError('${error}')`);

    let errorMessage = SessionListenerBase.WIFI_ERROR_MAP.get(error);
    if (!errorMessage) {
      log.error(`No error message mapping for wifi error '${error}'`);
      errorMessage = error;
    }

    this._error = errorMessage;
    if (this._socketSession) {
      this._sendError(errorMessage);
    }
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

    if (wifi.isOnline() && this._status !== status) {
      this._status = status;
      if (this._socketSession) {
        this._sendStatus(status);
      }
    }
  }

  _onServerError(error) {
    error = error.toString();
    log.debug(`SessionListenerBase._onServerError('${error}')`);

    if (this._socketSession) {
      this._sendError(error);
    }
  }

  _onData() {
    throw new Error(`Subclasses must override _onData`);
  }

  _onRssiUpdate() {
    throw new Error(`Subclasses must override _onRssiUpdate`);
  }
}
