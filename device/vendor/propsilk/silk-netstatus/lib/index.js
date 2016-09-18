/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * This module provides a consistent indicator of network connectivity.  By
 * default this means we can connect to major Internet services, but the
 * connectivity test can be tailored.
 * @module silk-netstatus
 * @example
 * import netstatus from 'silk-netstatus';
 *
 * netstatus.on('online', () => {
 *   // online
 * });
 * netstatus.on('offline', () => {
 *   // offline
 * });
 *
 * @private
 * @flow
 */

import assert from 'assert';
import EventEmitter from 'events';
import checkOnline from 'is-online';
import createLog from 'silk-log/device';
import silkWifi from 'silk-wifi';

import type { Wifi, StubWifi } from 'silk-wifi';

const log = createLog('network_status');

const CHECK_INTERVAL_MS = 2000; // 2s
const MAX_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 5min
const IS_ONLINE = (): Promise<boolean> => {
  return new Promise((accept, reject) => {
    checkOnline((err, value) => {
      if (err) {
        reject(err);
        return;
      }
      accept(value);
    });
  });
};

export type IsOnLineTest = () => Promise<boolean>;

export class NetworkStatus extends EventEmitter {
  /**
   * `online` event. This event is emitted when the network is online
   *
   * @event online
   * @memberof silk-netstatus
   * @instance
   */
  /**
   * `offline` event. This event is emitted when the network is online
   *
   * @event offline
   * @memberof silk-netstatus
   * @instance
   */
  // Wifi module to use
  _wifi: Wifi | StubWifi;

  // function to check if we are online or not ...
  _isOnlineFn: () => Promise<boolean>;

  // internal flag when we are online/offline ...
  _online: ?boolean = null; // set to null so first check will set online/offline event

  // how often to check if we are online again ...
  _checkIntervalMS: ?number = null;
  // setTimeout handle...
  _checkIntervalHandle: ?number = null;
  // number of attempts to check if are online ...
  _checkAttempt: number = 0;

  constructor(wifi: Wifi | StubWifi) {
    super();
    assert(wifi instanceof EventEmitter, 'must pass wifi module');
    this._wifi = wifi;
  }

  /**
   * Is the device currently online?
   *
   * @memberof silk-netstatus
   * @instance
   */
  get online(): boolean {
    return !!this._online;
  }

  /**
   * Start background checking for online.  This only needs to be called once.
   *
   * @param {Function} isOnlineFn Function to test for connectivity of type `(): Promise<bool>`
   * @param {number} [checkInterval=2000] How often in milliseconds to check for connectivity
   * @memberof silk-netstatus
   * @instance
   */
  start(
    isOnlineFn: IsOnLineTest = IS_ONLINE,
    checkInterval: number = CHECK_INTERVAL_MS
  ) {
    assert(typeof isOnlineFn === 'function');

    this._isOnlineFn = isOnlineFn;
    this._checkIntervalMS = checkInterval;

    this._wifi.on('online', this._onWifiOnline);
    this._wifi.on('offline', this._onWifiOffline);

    if (this._wifi.isOnline()) {
      this._onWifiOnline();
    } else {
      this._onWifiOffline();
    }
  }

  /**
   * Manually check for online.
   *
   * @memberof silk-netstatus
   * @return {Promise<void>}
   * @instance
   */
  check: () => Promise<void> = async (): Promise<void> => {
    log.info(`Checking for connection...`);
    let canConnect = false;
    try {
      canConnect = await this._isOnlineFn();
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
      timeout,
    });
    this._checkAttempt++;
    setTimeout(this.check, timeout);
    this.emit('check failure', timeout);
  };

  _onWifiOnline: (() => void) = () => {
    log.info('wifi online');
    this.check();
  };

  _onWifiOffline: (() => void) = () => {
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
  };

  _changeOnlineStatus(online: boolean) {
    // Only emit the event if there is a state change.
    let event = (online) ? 'online' : 'offline';
    let shouldEmitEvent = (online !== this._online) ?
      true :
      false;

    this._online = online;
    if (shouldEmitEvent) {
      log.info(`online = ${String(online)}`);
      this.emit(event);
    }
  }
}

let netstatus = new NetworkStatus(silkWifi);
export default netstatus;
