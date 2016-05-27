/**
 * @private
 * @flow
 */

import invariant from 'assert';
import { EventEmitter } from 'events';
import * as net from 'net';
import {Netmask} from 'netmask';
import * as util from 'silk-sysutils';
import createLog from 'silk-log/device';

import type { Socket } from 'net';

type WifiScanResult = {
  ssid: string;
  level: number;
  psk: boolean;
};

const log = createLog('wifi');
const USE_WIFI_STUB = util.getboolprop(
  'persist.silk.wifi.stub',
  process.platform !== 'android'
);

/**
 * Configures the specified network interface based on current system
 * property values as set by dhcpd
 *
 * @param iface Name of the interface to configure
 * @private
 */
async function configureDhcpInterface(iface: string) {
  const ifacePrefix = `dhcp.${iface}`;

  // dhcpd provides its output in system properties,
  let dns = [];
  for (let i = 1; i <= 4; i++) {
    const dnsN = util.getstrprop(`${ifacePrefix}.dns${i}`);
    if (dnsN) {
      dns.push(dnsN);
    }
  }

  const ipaddress = util.getstrprop(`${ifacePrefix}.ipaddress`);
  const mask = util.getstrprop(`${ifacePrefix}.mask`);
  const gateway = util.getstrprop(`${ifacePrefix}.gateway`);
  const domain = util.getstrprop(`${ifacePrefix}.domain`, 'localdomain');

  const block = new Netmask(ipaddress + '/' + mask);
  const baseMask = block.base + '/' + block.bitmask;

  log.info(`Network configuration:\n` +
           `interface: ${iface}\n` +
           `ipaddress: ${ipaddress}/${mask}\n` +
           `dns: ${dns}\n` +
           `gateway: ${gateway}\n` +
           `domain: ${domain}\n` +
           `base: ${baseMask}`);

  // Add basic routing table and DNS
  await util.exec('ndc', ['network', 'destroy', '100']);
  await util.exec('ndc', ['network', 'create', '100']);
  await util.exec('ndc', ['network', 'interface', 'add', '100', iface]);
  await util.exec('ndc', ['network', 'route', 'add', '100', iface, '0.0.0.0/0', gateway]);
  await util.exec('ndc', ['network', 'route', 'add', '100', iface, baseMask, '0.0.0.0']);
  await util.exec('ndc', ['network', 'default', 'set', '100']);
  await util.exec('ndc', ['resolver', 'setnetdns', '100', domain, ...dns]);
}

// Duration between network scans while not connected.
const SCAN_INTERVAL_MS = 10 * 1000;

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

// TODO: this currently also means we ignore non-ASCII SSIDs.
// See https://github.com/silklabs/silk-core/issues/357.
const CTRL_CHARS_REGEX = /[\x00-\x1f\x80-\xff]/;

let iface = util.getstrprop('wifi.interface');
let monitor;


/**
 * Unescape SSID strings as spat out by wpa_cli
 * @private
 */
function unescapeSSID(ssid: string): string {
  // To unescape sequences like \xAB, we convert them to \u00AB and
  // then feed them to JSON.parse (making sure that double quotes are
  // escaped). Bit of a hack, but works reliably.
  ssid = JSON.parse(
    '"' +
    ssid.replace('"', '\\"').replace(/\\x/g, '\\u00') +
    '"'
  );
  invariant(typeof ssid === 'string');
  return ssid;
}

/**
 * Wrapper around Gonk's WiFi daemons.
 * @private
 */
class WpaMonitor extends EventEmitter {

  _ready: bool = false;
  _socket: ?Socket;
  _buffer: string = '';

  constructor() {
    super();
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
    let socket = this._socket = net.connect({path: '/dev/socket/wpad'}, () => {
      this._buffer = '';
      this._ready = true;
    });
    socket.on('data', data => this._onData(data));
    socket.on('error', err => {
      this._restart(`wpad error, reason=${err}`);
    });
    socket.on('close', hadError => {
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
        case 'CTRL-EVENT-SCAN-STARTED':
          break;
        case 'CTRL-EVENT-SCAN-RESULTS':
          this.emit('scanResults');
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

async function wpaCliRemoveNetwork(id) {
  await wpaCliExpectOk('remove_network', id);
  await wpaCliExpectOk('save_config');
}

function wpaCliRemoveAllNetworks() {
  return wpaCliRemoveNetwork('all');
}

/**
 *  Silk wifi module
 *  @module silk-wifi
 *
 * @example
 * const wifi = require('silk-wifi').default;
 *
 * wifi.init()
 * .then(function() {
 *   return wifi.online();
 * })
 * .then(function() {
 *   log.info('Wifi initialized successfully');
 * })
 * .catch(function(err) {
 *   log.error('Failed to initialize wifi', err);
 * });
 */
export class Wifi extends EventEmitter {

  // Always start as offline until proven otherwise...
  _online: bool = false;
  _shutdown: bool = false;
  dhcpRetryTimer: ?number;
  _shutdown: bool = false;

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

      return configureDhcpInterface(iface)
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
      log.warn(`Error: DHCP request failed: ${err.stack || err}, retrying...`);
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
        this.emit('error', new Error(reason));
      }
      this._networkCleanup();
      log.info(`==> Wifi offline (${reason})`);
      this._online = false;
      this.emit('offline');
      this.scan();
    });
    monitor.on('stateChange', state => {
      this.emit('stateChange', state);
    });
    monitor.on('scanResults', async () => {
      await this._emitScanResults();
      if (this._online) {
        return;
      }
      // Schedule another scan
      await util.timeout(SCAN_INTERVAL_MS);
      if (!this._online) {
        this.scan();
      }
    });

    return Promise.resolve();
  }

  /**
   * Initialize wifi module
   * @memberof silk-wifi
   * @instance
   */
  async init(): Promise<void> {
    log.info('WiFi initializing');

    // Set the device hostname to something that is probably unique
    util.setprop('net.hostname', 'silk-' + util.getstrprop('ro.serialno'));

    // add 'error' listener in case no one else is, else node throws exception
    this.on('error', () => {});

    await this._networkCleanup();
    await this._startWpaMonitor();
    await wpaCli('scan');
    await wpaCli('status');
    await wpaCliExpectOk('log_level', 'excessive');
    log.info('WiFi initialization complete');
  }

  /**
   * Shutdown wifi subsystem on the device
   *
   * @memberof silk-wifi
   * @instance
   */
  shutdown(): Promise<void> {
    // Once Wifi has been shutdown(), there's no recovery beyond restart
    log.info('WiFi shutdown');
    this._shutdown = true;
    return this._networkCleanup();
  }

  /**
   * Check if device is online
   *
   * @memberof silk-wifi
   * @instance
   */
  isOnline(): bool {
    return this._online;
  }

  /**
   * Bring-up wifi subsystem online
   *
   * @memberof silk-wifi
   * @instance
   */
  /* async */ online(): Promise<void> {
    if (this._online) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.once('online', resolve);
    });
  }

  /**
   * Initiate a wifi scan request. Result of the scan is available via event
   * `scanResults`.
   *
   * @type {Object}
   * @property {string} ssid
   * @property {string} bssid
   * @property {number} level
   * @property {boolean} psk True if network requires WPA or PSK
   *
   * @memberof silk-wifi
   * @instance
   *
   * @example
   * wifi.scan();
   * wifi.on('scanResults', (result) => {
   *   log.info(`ssid: ${result.ssid}`);
   *   log.info(`bssid: ${result.bssid}`);
   *   log.info(`bssid: ${result.level}`);
   *   log.info(`bssid: ${result.psk}`);
   * });
   */
  scan() {
    log.info('Issuing scan request');
    wpaCli('scan')
    .catch(err => {
      log.warn('scan failed with', err.stack || err);
    });
  }

  async _emitScanResults(): Promise<void> {
    // Fetch the latest scan results
    const stdout = await wpaCli('scan_results');
    let lines = stdout.split('\n');

    // Check header/footer line
    if (lines[0] !== 'bssid / frequency / signal level / flags / ssid') {
      throw new Error(`Unexpected wpa_cli header: "${lines[0]}"`);
    }
    lines.shift();
    if (lines[lines.length - 1] !== '') {
      throw new Error(`Unexpected wpa_cli footer: "${lines[lines.length - 1]}"`);
    }
    lines.pop();

    // Parse each discovered network line
    let bestNetworks = {};
    for (const line of lines) {
      let info = line.split('\t');
      if (info.length !== 5) {
        log.warning(`Unexpected wpa_cli scan result: "${line}"`);
        continue;
      }
      let [/*bssid*/, /*freq*/, level, flags, ssid ] = info;
      ssid = unescapeSSID(ssid);

      if (ssid.length === 0 || CTRL_CHARS_REGEX.test(ssid)) {
        // Ignore zero-length SSID names or SSIDs with funky characters.
        continue;
      }

      // Search |flags| for:
      // 1. "WPA-PSK" or "WPA2-PSK"
      // 2. No "WEP"
      // Otherwise assume an open network
      let psk = false;
      if (flags.includes('WEP')) {
        continue; // No
      }
      if (flags.includes('WPA')) {
        if (!flags.includes('PSK')) {
          continue; // Only WPA/WPA2 PSK supported
        }
        psk = true;
      }

      const key = `${ssid}\0${psk}`;
      level = parseInt(level, 10);
      const existingNetwork = bestNetworks[key];
      if (existingNetwork && existingNetwork.level < level) {
        existingNetwork.level = level;
      } else {
        bestNetworks[key] = {ssid, level, psk};
      }
    }

    // Rebuild scanResults with just the strongest ssids
    let scanResults = [];
    for (let key in bestNetworks) {
      scanResults.push(bestNetworks[key]);
    }

    log.debug('scanResults', scanResults);
    this.emit('scanResults', scanResults);
  }

  /**
   * Issue a request to join the specified network
   *
   * @param ssid Name of the network to connect to
   * @param psk WPA2 PSK of the network to connect (null for Open)
   * @memberof silk-wifi
   * @instance
   */
  async joinNetwork(ssid: string, psk: ?string): Promise<void> {
    if (ssid.length === 0) {
      throw new Error('Empty SSID');
    }
    if (psk) {
      // |wpa_cli| refuses a WPA/WPA2 PSK outside the range 8..63 so don't even try
      if (psk.length < 8 || psk.length > 63) {
        throw new Error('Invalid WPA/WPA2 PSK length');
      }
    }
    await wpaCliRemoveAllNetworks();
    const id = await wpaCliAddNetwork();
    await wpaCliExpectOk('set_network', id, 'ssid', `"${ssid}"`);
    await wpaCliExpectOk('set_network', id, 'scan_ssid', '1');
    if (psk) {
      await wpaCliExpectOk('set_network', id, 'psk', `"${psk}"`);
    } else {
      await wpaCliExpectOk('set_network', id, 'key_mgmt', 'NONE');
    }
    await wpaCliExpectOk('enable_network', id);
    await wpaCliExpectOk('save_config');
    await wpaCliExpectOk('reconnect');
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

  /**
   * Issue a request to forget all previously known networks
   *
   * @memberof silk-wifi
   * @instance
   */
  forgetNetwork() {
    log.info('forget networks...');
    return wpaCliRemoveAllNetworks()
      .then(() => wpaCliExpectOk('disconnect'))
      .then(() => this._networkCleanup());
  }
}


export class StubWifi extends EventEmitter {

  constructor() {
    super();
  }

  init(): Promise<void> {
    log.info('Using stub "WiFi"');
    if (util.getboolprop('ro.kernel.qemu')) {
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
      return util.exec('ndc', ['resolver', 'setnetdns', /*netId=*/'0', '.localhost', ...dns])
        .then(() => { return; });
    }
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    log.info('Stub: "WiFi" shutdown');
    return Promise.resolve();
  }

  isOnline(): bool {
    // Fingers crossed that somehow the device is online
    return true;
  }

  online(): Promise<void> {
    return Promise.resolve();
  }

  scan() {
    log.warn('StubWifi.scan not implemented');
  }

  joinNetwork(ssid: string, psk: string): Promise<void> { //eslint-disable-line
    return Promise.reject(new Error('StubWifi.joinNetwork not implemented'));
  }

  networkConfigured(): Promise<void> {
    return Promise.resolve();
  }

  forgetNetwork(): Promise<void> {
    log.warn('StubWifi.forgetNetwork not implemented');
    return Promise.resolve();
  }
}

export default USE_WIFI_STUB ? new StubWifi() : new Wifi();
