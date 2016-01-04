/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.

 * This module is designed to provide a consistent indicator that we can or
 * cannot connect to the Internet... This is distinctly different from "do we
 * have a wifi connection" as you can still be connected to wifi and have no
 * connection.
 *
 * @flow
 */


import assert from 'assert';
import createLog from './log';
import checkOnline from 'is-online';
import { EventEmitter } from 'events';

import type { Wifi } from './wifi';
import type { Socket } from 'socket.io-client';

const log = createLog('network_status');

const CHECK_INTERVAL_MS = 2000; // 2s
const MAX_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 5min
const IS_ONLINE = (): Promise<bool> => {
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
  _wifi: Wifi = null;
  // function to check if we are online or not ...
  _isOnlineFn: (() => Promise<bool>);

  // hint socket ...
  _hintSocket: ?Socket = null;

  set hintSocket(socket) {
    if (this._hintSocket) {
      let oldSocket = this._hintSocket;
      oldSocket.removeListener('connect', this._checkForConnection);
      oldSocket.removeListener('disconnect', this._checkForConnection);
    }

    if (socket) {
      socket.on('connect', this._checkForConnection);
      socket.on('disconnect', this._checkForConnection);
    }

    this._hintSocket = socket;
  }
  get hintSocket(): ?Socket {
    return this._hintSocket;
  }

  // internal flag when we are online/offline ...
  _online: ?bool = null; // set to null so first check will set online/offline event

  // how often to check if we are online again ...
  _checkIntervalMS: ?number = null;
  // setTimeout handle...
  _checkIntervalHandle: ?number = null;
  // number of attempts to check if are online ...
  _checkAttempt: number = 0;

  get online(): bool {
    return !!this._online;
  }

  constructor(
    wifi: Wifi,
    isOnlineFn: () => Promise<bool> = IS_ONLINE,
    checkInterval: number = CHECK_INTERVAL_MS
  ) {
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
      if (this._checkIntervalHandle) {
        clearInterval(this._checkIntervalHandle);
        this._checkIntervalHandle = null;
      }
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
   * Returns a Promise that accepts when somewhere interesting is reachable
   * (like maybe the Internet).
   */
  isOnline(): Promise<bool> {
    return this._isOnlineFn();
  }

  _changeOnlineStatus(online: bool) {
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

  _checkForConnection: () => Promise<void> = async (): Promise<void> => {
    log.info(`Checking for connection...`);
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
    log.info(`Could not connect, will retry`, {
      attempt: this._checkAttempt,
      timeout
    });
    this._checkAttempt++;
    setTimeout(this._checkForConnection, timeout);
    this.emit('check failure', timeout);
  };

}
