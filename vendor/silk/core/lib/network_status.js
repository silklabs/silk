/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/**
 * This module is designed to provide a consistent indicator that we can or
 * cannot connect to the Internet... This is distinctly different from "do we
 * have a wifi connection" as you can still be connected to wifi and have no
 * connection.
 */


import assert from 'assert';
import createLog from './log';
import checkOnline from 'is-online';
import { EventEmitter } from 'events';

const log = createLog('network_status');

const CHECK_INTERVAL_MS = 2000; // 2s
const MAX_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 5min
const IS_ONLINE = () => {
  return new Promise((accept, reject)=> {
    checkOnline((err, value) => {
      if (err) {
        reject(err);
        return;
      }
      accept(value);
    });
  });
};

/**
 * To provide the best network accuracy we need both a hint socket and a
 * function to really validate if we are online.
 *
 * ```js
 * import NetworkStatus from '...';
 * let networkStatus = new NetworkStatus(wifi, socket, () => {
 *   return new Promise((accept) => {
 *      // false = offline
 *      accept(false);
 *   })
 * })
 * ```
 *
 */
export default class NetworkStatus extends EventEmitter {

  // wifi module...
  _wifi = null
  // function to check if we are online or not ...
  _isOnlineFn = null

  // hint socket ...
  _hintSocket = null
  set hintSocket(socket) {
    if (this._hintSocket) {
      this._hintSocket.removeListener('connect', this._checkForConnection);
      this._hintSocket.removeListener('disconnect', this._checkForConnection);
    }

    if (socket) {
      socket.on('connect', this._checkForConnection);
      socket.on('disconnect', this._checkForConnection);
    }

    this._hintSocket = socket;
  }
  get hintSocket() {
    return this._hintSocket;
  }

  // internal flag when we are online/offline ...
  _online = null // set to null so first check will set online/offline event

  // how often to check if we are online again ...
  _checkIntervalMS = null
  // setTimeout handle...
  _checkIntervalHandle = null
  // number of attempts to check if are online ...
  _checkAttempt = 0

  get online() {
    return !!this._online;
  }

  constructor(wifi, isOnlineFn = IS_ONLINE, checkInterval = CHECK_INTERVAL_MS) {
    super();
    assert(wifi instanceof EventEmitter, 'must pass wifi module');
    assert(typeof isOnlineFn === 'function');

    this._wifi = wifi;
    this._isOnlineFn = isOnlineFn;
    this._checkIntervalMS = checkInterval;

    wifi.on('online', () => {
      log.info('wifi online');
      this._checkForConnection();
    });
    wifi.on('offline', () => {
      log.info('wifi offline');
      // We do not need to check for a connection if we are completely sure to
      // be offline...
      clearInterval(this._checkIntervalHandle);
      this._checkIntervalHandle = null;
      // reset connection attempts since we will not be trying while wifi is
      // disconnected...
      this._checkAttempt = 0;

      this._changeOnlineStatus(false);
    });

    if (wifi.isOnline()) {
      // wifi is online run the first check...
      this._checkForConnection();
    } else {
      // wifi is offline so wait for an event before checking if we are online.
      this._changeOnlineStatus(false);
    }
  }

  /**
   * Check if we can reach the internet.
   */
  isOnline() {
    return this._isOnlineFn();
  }

  _changeOnlineStatus(online) {
    // Only emit the event if there is a state change.
    let event = (online) ? 'online' : 'offline';
    let shouldEmitEvent = (online !== this._online) ?
      true :
      false;

    this._online = online;
    if (shouldEmitEvent) {
      log.info(`online = ${online}`);
      this.emit(event);
    }
  }

  _checkForConnection = async () => {
    log.info(`Checking for internet connection...`);
    let canConnect = false;
    try {
      canConnect = await this.isOnline();
    } catch (err) {
      log.error(`
        Unexpected error while checking if we are online:

        ${err.stack}
      `);
    }

    if (canConnect) {
      this._changeOnlineStatus(true);
      // reset connection attempts if we are successful.
      this._checkAttempt = 0;
      return;
    }

    this._changeOnlineStatus(false);
    let timeout = Math.min(
      this._checkAttempt * this._checkIntervalMS,
      MAX_CHECK_INTERVAL_MS
    );
    log.info(`Could not connect to the internet will retry`, {
      attempt: this._checkAttempt,
      timeout
    });
    this._checkAttempt++;
    setTimeout(this._checkForConnection, timeout);
    this.emit('check failure', timeout);
  }

}
