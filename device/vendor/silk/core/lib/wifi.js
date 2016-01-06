/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as util from './sysutils';
import events from 'events';
import net from 'net';
import createLog from './log';
import type {Socket} from 'socket.io-client';

const log = createLog('wifi');
const USE_QEMU_WIFI = util.getboolprop('ro.silk.wifi.qemu', false);

// ref: external/wpa_supplicant_8/src/common/defs.h
const WIFI_STATES = [
  'disconnected',
  'disabled',
  'inactive',
  'scanning',
  'authenticating',
  'associating',
  'associated',
  'four_way_handshake',
  'group_handshake',
  'completed',
];

// ref: external/wpa_supplicant_8/src/common/ieee802_11_defs.h
const WIFI_DISCONNECT_REASONS = [
  'invalid_0',
  'unspecified',
  'prev_auth_not_valid',
  'deauth_leaving',
  'disassoc_due_to_inactivity',
  'disassoc_ap_busy',
  'class2_frame_from_nonauth_sta',
  'class3_frame_from_nonassoc_sta',
  'disassoc_sta_has_left',
  'sta_req_assoc_without_auth',
  'pwr_capability_not_valid',
  'supported_channel_not_valid',
  'invalid_12',
  'invalid_ie',
  'michael_mic_failure',
  '4way_handshake_timeout',
  'group_key_update_timeout',
  'ie_in_4way_differs',
  'group_cipher_not_valid',
  'pairwise_cipher_not_valid',
  'akmp_not_valid',
  'unsupported_rsn_ie_version',
  'invalid_rsn_ie_capab',
  'ieee_802_1x_auth_failed',
  'cipher_suite_rejected',
  'tdls_teardown_unreachable',
  'tdls_teardown_unspecified',
  'invalid_27',
  'invalid_28',
  'invalid_29',
  'invalid_30',
  'invalid_31',
  'invalid_32',
  'invalid_33',
  'disassoc_low_ack',
];

let iface = util.getstrprop('wifi.interface');
let monitor;

class WpaMonitor extends events.EventEmitter {

  _ready: bool;
  _socket: Socket;
  _buffer: string;

  constructor() {
    super();
    this._ready = false;
    this._init();
  }

  ready() {
    return this._ready;
  }

  _restart(why) {
    if (this._socket) {
      this._ready = false;
      this._socket = null;

      log.info(`wpad restart: ${why}`);
      util.timeout(1000)
      .then(() => this._init())
      .catch(util.processthrow);
      return;
    }
    log.info(`wpad restart pending (ignored "${why}")`);
  }

  _init() {
    this._socket = net.createConnection('/dev/socket/wpad', () => {
      this._buffer = '';
      this._ready = true;
    });
    this._socket.on('data', data => this._onData(data));
    this._socket.on('error', err => {
      this._restart(`wpad error, reason=${err}`);
    });
    this._socket.on('close', hadError => {
      if (!hadError) {
        this._restart(`wpad close`);
      }
    });
  }

  _onData(data) {
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^200 IFNAME=([^ ]+) ([^ ]+) (.*)/))) {
        let [, _iface, cmd, extra] = found;
        if (iface !== _iface) {
          log.info(`Ignoring command from unknown interface ${_iface}: ${cmd}`);
          continue;
        }

        switch (cmd) {
        case 'CTRL-EVENT-TERMINATING':
          this._restart(cmd);
          break;
        case 'CTRL-EVENT-DISCONNECTED':
          let reason = '';
          if ((found = extra.match(/ reason=([0-9]+)/))) {
            let reasonIndex = Number(found[1]);
            reason = WIFI_DISCONNECT_REASONS[reasonIndex];
            log.info(`wifi disconnect reason: ${reason}`);
          }
          this.emit('disconnected', reason);
          break;
        case 'CTRL-EVENT-CONNECTED':
          this.emit('connected');
          break;
        case 'CTRL-EVENT-STATE-CHANGE':
          if ((found = extra.match(/ state=([0-9]) /))) {
            let stateIndex = Number(found[1]);
            let state = WIFI_STATES[stateIndex];
            log.info(`wifi state: ${state}`);
            this.emit('stateChange', state);
          }
          break;
        default:
          log.warn(`(ignored) ${cmd} | ${extra}`);
          break;
        }
        continue;
      }
      log.warn(`Error: Unknown wpad output: ${line}`);
    }
  }
}

function wpaCli(...args) {
  if (!monitor.ready()) {
    log.info('wpaCli: supplicant not ready, waiting');
    return util.timeout(1000).then(() => wpaCli(...args));
  }

  const bin = 'wpa_cli';
  const fullArgs = [`-i${iface}`, `IFNAME=${iface}`, ...args];

  return util.exec(bin, fullArgs)
    .then(r => {
      if (r.code !== 0) {
        return Promise.reject(new Error(`'${bin} ${fullArgs.join(' ')}' ` +
                                        `returned ${r.code}: ` +
                                        `'${r.stdout.replace(/\n/g, '')}'`));
      }
      return Promise.resolve(r.stdout);
    });
}

function wpaCliExpectOk(...args) {
  return wpaCli(...args).then(
    ok => {
      if (ok.match(/^OK/)) {
        return Promise.resolve();
      }

      const bin = 'wpa_cli';
      const fullArgs = [`-i${iface}`, `IFNAME=${iface}`, ...args];

      return Promise.reject(new Error(`'${bin} ${fullArgs.join(' ')}': ` +
                                      `'${ok.replace(/\n/g, '')}'`));
    }
  );
}

function wpaCliGetNetworkIds() {
  return wpaCli('list_networks').then(
    networkList => {
      let ids = networkList.split('\n').map(
        netInfo => {
          let found;
          if ((found = netInfo.match(/^([0-9]+)/))) {
            return found[1];
          }
        }
      );
      return Promise.resolve(ids.filter(notnull => notnull));
    }
  );
}

function wpaCliAddNetwork() {
  return wpaCli('add_network').then(
    id => {
      let found;
      if ((found = id.match(/^([0-9]+)/))) {
        return Promise.resolve(found[1]);
      }

      const bin = 'wpa_cli';
      const fullArgs = [`-i${iface}`, `IFNAME=${iface}`, `add_network`];

      return Promise.reject(new Error(`'${bin} ${fullArgs.join(' ')}': ` +
                                      `'${id.replace(/\n/g, '')}'`));
    }
  );
}

function wpaCliRemoveNetwork(id) {
  return wpaCliExpectOk('remove_network', id)
    .then(() => wpaCliExpectOk('save_config'));
}

function wpaCliRemoveAllNetworks() {
  return wpaCliRemoveNetwork('all');
}


export class Wifi extends events.EventEmitter {

  // Always start as offline until proven otherwise...
  _online: bool = false;
  _shutdown: bool = false;
  dhcpRetryTimer: ?number;

  constructor() {
    super();
    this.dhcpRetryTimer = null;
  }

  _networkCleanup() {
    if (this.dhcpRetryTimer) {
      clearTimeout(this.dhcpRetryTimer);
      this.dhcpRetryTimer = null;
    }
    return util.exec('dhcputil', [iface, 'dhcp_stop'])
      .then(() => util.exec('ndc', ['network', 'destroy', '100']))
      .then(() => util.exec('ndc', ['interface', 'clearaddrs', iface]))
      .then(() => util.exec('ndc', ['interface', 'getcfg', iface]))
      .then(r => {
        log.info(`${iface} state| ${r.stdout}`);
      })
      .catch(err => {
        log.warn(`Error: Network cleanup failed: ${err}`);
      });
  }

  _requestDhcp() {
    log.info('Issuing DHCP request');

    this.emit('stateChange', 'dhcping');

    util.exec('dhcputil', [iface, 'dhcp_stop'])
    .then(result => {
      if (result.code !== 0) {
        log.warn(`dhcp_stop failed: ret=${result.code}: ${result.stdout}`);
      }
      return util.exec('dhcputil', [iface, 'dhcp_request']);
    })
    .then(result => {
      if (result.code !== 0) {
        let err = new Error(result.stdout);
        throw err;
      }

      // dhcpd provides its output in system properties,
      let dns = [];
      for (let i = 1; i <= 4; i++) {
        let dnsN = util.getstrprop(`dhcp.${iface}.dns${i}`);
        if (dnsN) {
          dns.push(dnsN);
        }
      }

      let ipaddress = util.getstrprop(`dhcp.${iface}.ipaddress`);
      let mask = util.getstrprop(`dhcp.${iface}.mask`);
      let gateway = util.getstrprop(`dhcp.${iface}.gateway`);
      let domain = util.getstrprop(`dhcp.${iface}.domain`);
      if (domain === '') {
        domain = 'localdomain';
      }

      let Netmask = require('netmask').Netmask;
      let block = new Netmask(ipaddress + '/' + mask);
      let baseMask = block.base + '/' + block.bitmask;

      log.info(`DHCP configuration:\nipaddress: ${ipaddress}/${mask}\n` +
               `dns: ${dns}\ngateway: ${gateway}\ndomain: ${domain}\n` +
               `base: ${baseMask}`);

      // Add basic routing table and DNS
      return Promise.resolve()
        .then(() => util.exec('ndc', ['network', 'destroy', '100']))
        .then(() => util.exec('ndc', ['network', 'create', '100']))
        .then(() => util.exec('ndc', ['network', 'interface', 'add', '100', iface]))
        .then(() => util.exec('ndc', ['network', 'route', 'add', '100', iface, '0.0.0.0/0', gateway]))
        .then(() => util.exec('ndc', ['network', 'route', 'add', '100', iface, baseMask, '0.0.0.0']))
        .then(() => util.exec('ndc', ['network', 'default', 'set', '100']))
        .then(() => util.exec('ndc', ['resolver', 'setnetdns', '100', domain, ...dns]))
        .then(() => util.exec('ndc', ['interface', 'getcfg', iface]))
        .catch(util.processthrow);
    })
    .then(r => {
      log.info(`${iface} state| ${r.stdout}`);

      if (this._shutdown) {
        log.info('(WiFi shutdown)');
        return this._networkCleanup();
      }

      log.info('==> Wifi online');
      this._online = true;
      this.emit('online');
    })
    .catch(err => {
      log.warn(`Error: DHCP request failed: ${err}, retrying...`);
      this.dhcpRetryTimer = setTimeout(() => {
        this._requestDhcp();
        this.dhcpRetryTimer = null;
      }, 2000);
    });
  }

  _startWpaMonitor(): Promise<void> {

    monitor = new WpaMonitor(iface);
    monitor.on('connected', () => {
      log.info('Wifi Connected.');
      this._requestDhcp();
    });
    monitor.on('disconnected', (reason) => {
      // Send error unless leaving under normal circumstances
      if (reason !== 'deauth_leaving') {
        this.emit('error', reason);
      }
      this._networkCleanup();
      log.info(`==> Wifi offline (${reason})`);
      this._online = false;
      this.emit('offline');
    });
    monitor.on('stateChange', state => {
      this.emit('stateChange', state);
    });

    return Promise.resolve();
  }

  init() {
    log.info('WiFi initializing');

    // Set the device hostname to something that is probably unique
    util.setprop('net.hostname', 'silk-' + util.getstrprop('ro.serialno'));

    // add 'error' listener in case no one else is, else node throws exception
    this.on('error', () => {});

    return this._networkCleanup()
      .then(() => this._startWpaMonitor())
      .then(() => wpaCli('scan'))
      .then(() => wpaCli('status'))
      .then(() => wpaCliExpectOk('log_level', 'excessive'))
      .then(() => {
        log.info('WiFi initialization complete');
        return Promise.resolve();
      });
  }

  shutdown() {
    // Once Wifi has been shutdown(), there's no recovery beyond restart
    log.info('WiFi shutdown');
    this._shutdown = true;
    return this._networkCleanup();
  }

  isOnline(): bool {
    return this._online;
  }

  /* async */ online(): Promise<void> {
    if (this._online) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.once('online', resolve);
    });
  }

  joinNetwork(ssid: string, psk: string) {
    if (ssid.length === 0) {
      throw new Error('Empty SSID');
    }
    // |wpa_cli| refuses a PSK outside the range 8..63 so don't even try
    if (psk.length < 8 || psk.length > 63) {
      throw new Error('Invalid PSK length');
    }
    return wpaCliRemoveAllNetworks()
      .then(wpaCliAddNetwork)
      .then(id => {
        return wpaCliExpectOk('set_network', id, 'ssid', `"${ssid}"`)
          .then(() => wpaCliExpectOk('set_network', id, 'psk', `"${psk}"`))
          .then(() => wpaCliExpectOk('enable_network', id))
          .then(() => wpaCliExpectOk('save_config'))
          .then(() => wpaCliExpectOk('reconnect'));
      });
  }

  networkConfigured() {
    return wpaCliGetNetworkIds()
      .then(
        ids => {
          if (ids.length > 0) {
            // If any networks exist then the device is 'configured'
            return Promise.resolve();
          }
          return Promise.reject();
        }
      );
  }

  forgetNetwork() {
    log.info('forget networks...');
    return wpaCliRemoveAllNetworks()
      .then(() => wpaCliExpectOk('disconnect'));
  }
}


export class QEmuWifi extends events.EventEmitter {

  constructor() {
    super();
  }

  init() {
    log.info('QEmu "WiFi" initializing on eth0');
    // Most of the emulator eth0 networking is setup automatically.  The only
    // thing missing is to instruct netd to use the DNS servers for the
    // hardcoded netId == 0
    let dns = [];
    for (let i = 1; i <= 4; i++) {
      let dnsN = util.getstrprop(`net.eth0.dns${i}`);
      if (dnsN) {
        dns.push(dnsN);
      }
    }
    return util.exec('ndc', ['resolver', 'setnetdns', /*netId=*/'0', '.localhost', ...dns]);
  }

  shutdown() {
    log.info('QEmu: "WiFi" shutdown');
  }

  isOnline(): bool {
    return true;
  }

  online(): Promise<void> {
    return Promise.resolve();
  }

  joinNetwork(ssid: string, psk: string): Promise<void> { //eslint-disable-line
    return Promise.reject(new Error('QEmuWifi.joinNetwork not implemented'));
  }

  networkConfigured(): Promise<void> {
    return Promise.resolve();
  }

  forgetNetwork(): Promise<void> {
    log.warn('QEmuWifi.forgetNetwork not implemented');
    return Promise.resolve();
  }
}

export default USE_QEMU_WIFI ? new QEmuWifi() : new Wifi();
