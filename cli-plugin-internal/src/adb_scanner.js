/**
 * Scans the network for mDNS-based adb services
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

/* eslint-disable no-console */

import Bonjour from 'bonjour';
import EventEmitter from 'events';

// How often to rescan.
// Devices that don't respond within this window will be considered offline
const RESCAN_INTERVAL_MS = 10 * 1000;

export type AdbHostInfo = {
  name: string;
  ip: string;
  port: number;
};

// Inlined from https://github.com/AnatoliyGatt/is-ipv4-node/blob/ad537a/lib/is-ipv4.js#L20-L22
// (MIT License)
function isIPv4(val: string) {
  return !!/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(val);
}

export class AdbScanner extends EventEmitter {
  _adbHosts: Array<AdbHostInfo> = [];
  _bonjour: Object; // TODO: Flowify Bonjour class
  _active: boolean = false;
  _serialno: ?string;

  constructor(serialno: ?string) {
    super();
    this._bonjour = new Bonjour();
    this._serialno = serialno;
  }

  _ignoreHost(hostname: string): boolean {
    if (!this._serialno) {
      return false;
    }
    return (hostname !== `silk-${this._serialno}`);
  }

  _scan() {
    if (!this._active) {
      return;
    }
    let foundAdbHosts: Array<AdbHostInfo> = [];
    let browser = this._bonjour.find({type: 'adb'});
    browser.on('up', service => {
      const newhost = {
        name: service.name,
        ip: service.addresses.find(addr => isIPv4(addr)),
        port: service.port,
      };
      if (!newhost.ip) {
        return;
      }

      foundAdbHosts.push(newhost);
      if (!this._adbHosts.some(host => host.name === newhost.name)) {
        const ignore = this._ignoreHost(newhost.name);
        console.log('  device found:', newhost, ignore ? '(ignored)' : '');
        if (!ignore) {
          this.emit('found', newhost);
        }
      }
    });
    setTimeout(() => {
      browser.stop();

      // Look for devices that are no longer observed
      this._adbHosts.forEach(host => {
        if (!foundAdbHosts.some(newhost => newhost.name === host.name)) {
          const ignore = this._ignoreHost(host.name);
          console.log('  device lost:', host, ignore ? '(ignored)' : '');
          if (!ignore) {
            this.emit('lost', host);
          }
        }
      });

      this._adbHosts = foundAdbHosts;
      this._scan();
    }, RESCAN_INTERVAL_MS);
  }

  start() {
    if (this._active) {
      return;
    }
    this._active = true;
    this._scan();
  }

  stop() {
    this._active = false;
  }
}

