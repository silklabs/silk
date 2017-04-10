/**
 * @private
 * @flow
 */

import invariant from 'assert';
import EventEmitter from 'events';
import * as net from 'net';
import {Netmask} from 'netmask';
import createLog from 'silk-log';
import * as util from 'silk-sysutils';

import type {Socket} from 'net';
import type {ExecOutput} from 'silk-sysutils';

export type ConnectedNetworkInfo = {
  ssid: string;
  level: number;
};

export type ScanResult = ConnectedNetworkInfo & {
  psk: boolean;
};

const log = createLog('wifi');
const USE_WIFI_STUB = util.getboolprop(
  'persist.silk.wifi.stub',
  process.platform !== 'android'
);

// Duration between network scans while not connected.
const SCAN_INTERVAL_MS = 10 * 1000;
const DHCP_TIMEOUT_MS = 2000;

/**
 * Supported wifi states
 * @memberof silk-wifi
 */
//ref: external/wpa_supplicant_8/src/common/defs.h
export type WifiState = 'disconnected' |
                        'disabled' |
                        'inactive' |
                        'scanning' |
                        'authenticating' |
                        'associating' |
                        'associated' |
                        'four_way_handshake' |
                        'group_handshake' |
                        'completed';
const WIFI_STATE_MAP: Array<WifiState> = [
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
export type WifiDisconnectReason = 'invalid_0' |
                                   'unspecified' |
                                   'prev_auth_not_valid' |
                                   'deauth_leaving' |
                                   'disassoc_due_to_inactivity' |
                                   'disassoc_ap_busy' |
                                   'class2_frame_from_nonauth_sta' |
                                   'class3_frame_from_nonassoc_sta' |
                                   'disassoc_sta_has_left' |
                                   'sta_req_assoc_without_auth' |
                                   'pwr_capability_not_valid' |
                                   'supported_channel_not_valid' |
                                   'invalid_12' |
                                   'invalid_ie' |
                                   'michael_mic_failure' |
                                   '4way_handshake_timeout' |
                                   'group_key_update_timeout' |
                                   'ie_in_4way_differs' |
                                   'group_cipher_not_valid' |
                                   'pairwise_cipher_not_valid' |
                                   'akmp_not_valid' |
                                   'unsupported_rsn_ie_version' |
                                   'invalid_rsn_ie_capab' |
                                   'ieee_802_1x_auth_failed' |
                                   'cipher_suite_rejected' |
                                   'tdls_teardown_unreachable' |
                                   'tdls_teardown_unspecified' |
                                   'invalid_27' |
                                   'invalid_28' |
                                   'invalid_29' |
                                   'invalid_30' |
                                   'invalid_31' |
                                   'invalid_32' |
                                   'invalid_33' |
                                   'disassoc_low_ack';

const WIFI_DISCONNECT_REASONS: Array<WifiDisconnectReason> = [
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
 * Helper for other exec functions.
 * @private
 */
async function execCommon(
  cmd: string,
  args: Array<string>,
  abortPromise: ?Promise<void>,
  warning: ?string,
): Promise<ExecOutput> {
  const start = Date.now();
  log.verbose(`Executing '%s%s'`, cmd, args.length ? ` ` + args.join(` `) : ``);
  const promises = [util.exec(cmd, args)];
  if (abortPromise) {
    promises.push(abortPromise);
  }

  const result = await Promise.race(promises);
  const stop = Date.now();
  invariant(result);

  let {stderr, stdout} = result;
  stderr = stderr.trim();
  stdout = stdout.trim();
  const output = (stderr && stdout) ? {stderr, stdout} : (stderr || stdout);

  const {code} = result;
  const message = `(${stop - start}ms) '${cmd}' returned code ${String(code)}:`;

  if (code === 0) {
    log.verbose(message, output);
  } else {
    if (warning === null) {
      const prettyOutput =
        typeof output === `object` ?
        JSON.stringify(output) :
        output;
      throw new Error(`${message} ${prettyOutput}`);
    }
    log.warn(message, output);
  }
  return result;
}

/**
 * Exec and throw if the process returns a non-zero exit code.
 * @private
 */
async function execThrowOnNonZeroCode(
  cmd: string,
  args: Array<string>,
  abortPromise: ?Promise<void> = null,
): Promise<ExecOutput> {
  return execCommon(cmd, args, abortPromise, null);
}

/**
 * Exec and warn if the process returns a non-zero exit code.
 * @private
 */
async function execWarnOnNonZeroCode(
  cmd: string,
  args: Array<string>,
  abortPromise: ?Promise<void> = null,
  message?: string = '',
): Promise<ExecOutput> {
  return execCommon(cmd, args, abortPromise, message);
}

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
 * Try to restart dhcpd and set up the network route table.
 * @private
 */
async function requestDhcp(abortPromise: Promise<void>): Promise<void> {
  await execWarnOnNonZeroCode(
    'dhcputil',
    [iface, 'dhcp_stop'],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'dhcputil',
    [iface, 'dhcp_request'],
    abortPromise,
  );

  const ifacePrefix = `dhcp.${iface}`;

  // dhcpd provides its output in system properties.
  const dns = [];
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

  log.info(`DHCP configuration:\n` +
           `interface: ${iface}\n` +
           `ipaddress: ${ipaddress}/${mask}\n` +
           `dns: ${String(dns)}\n` +
           `gateway: ${gateway}\n` +
           `domain: ${domain}`);

  if (!ipaddress) {
    throw new Error(`dhcpd has not given us an address yet`);
  }

  const block = new Netmask(ipaddress + '/' + mask);
  const baseMask = block.base + '/' + block.bitmask;

  log.info(`base: ${baseMask}`);

  // Add basic routing table and DNS
  await execThrowOnNonZeroCode(
    'ndc',
    ['network', 'destroy', '100'],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'ndc',
    ['network', 'create', '100'],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'ndc',
    ['network', 'interface', 'add', '100', iface],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'ndc',
    ['network', 'route', 'add', '100', iface, '0.0.0.0/0', gateway],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'ndc',
    ['network', 'route', 'add', '100', iface, baseMask, '0.0.0.0'],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'ndc',
    ['network', 'default', 'set', '100'],
    abortPromise,
  );
  await execThrowOnNonZeroCode(
    'ndc',
    ['resolver', 'setnetdns', '100', domain, ...dns],
    abortPromise,
  );

  const {stdout} = await execThrowOnNonZeroCode(
    'ndc',
    ['interface', 'getcfg', iface],
    abortPromise,
  );
  log.info(`${iface} state| ${stdout}`);
}

/**
 * Wrapper around Gonk's WiFi daemons.
 * @private
 */
class WpaMonitor extends EventEmitter {

  _ready: boolean = false;
  _socket: ?Socket;
  _buffer: string = '';

  constructor() {
    super();
    this._init();
  }

  ready() {
    return this._ready;
  }

  _reconnect(why) {
    if (this._socket) {
      this._ready = false;
      this._socket = null;

      log.info(`wpad reconnect: ${why}`);
      util.timeout(1000)
      .then(() => this._init())
      .catch(util.processthrow);
      return;
    }
    log.info(`wpad reconnect pending (ignored "${why}")`);
  }

  _init() {
    let socket = this._socket = net.connect({path: '/dev/socket/wpad'}, () => {
      this._buffer = '';
      this._ready = true;
      log.info(`connected to wpad`);
    });
    socket.on('data', data => this._onData(data));
    socket.on('error', err => {
      this._reconnect(err);
    });
    socket.on('close', hadError => {
      if (!hadError) {
        this._reconnect(`wpad close`);
      }
    });
  }

  _onData(data) {
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      const line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^200 IFNAME=([^ ]+) ([^ ]+) (.*)/))) {
        const [, _iface, cmd, extra] = found;
        if (iface !== _iface) {
          log.info(`Ignoring command from unknown interface ${_iface}: ${cmd}`);
          continue;
        }

        switch (cmd) {
        case 'CTRL-EVENT-SSID-TEMP-DISABLED':
          if ((found = extra.match(/ ssid=\"([^"]*)\" /))) {
            const ssid = found[1];
            // TODO: maybe emit the failure count, reason code and disabled duration too?
            log.info(`SSID "${ssid}" temporarily disabled`);

            /**
             * This event is emitted when an SSID is disabled due to an
             * authorization error
             *
             * @event ssidTempDisabled
             * @memberof silk-wifi
             * @instance
             * @type {Object}
             * @property {string} SSID name
             */
            this.emit('ssidTempDisabled', ssid);
          } else {
            log.warn(`Unable to parse ${cmd} extra: ${extra}`);
          }
          break;
        case 'CTRL-EVENT-SSID-REENABLED':
          if ((found = extra.match(/ ssid=\"([^"]*)\"/))) {
            const ssid = found[1];
            log.info(`SSID "${ssid}" reenabled`);
            /**
             * This event is emitted when an SSID is reenabled after an
             * authorization error
             *
             * @event ssidReenabled
             * @memberof silk-wifi
             * @instance
             * @type {Object}
             * @property {string} SSID name
             */
            this.emit('ssidReenabled', ssid);
          } else {
            log.warn(`Unable to parse ${cmd} extra: ${extra}`);
          }
          break;
        case 'CTRL-EVENT-TERMINATING':
          this._reconnect(cmd);
          break;
        case 'CTRL-EVENT-DISCONNECTED':
          {
            let reason = '';
            if ((found = extra.match(/ reason=([0-9]+)/))) {
              const reasonIndex = Number(found[1]);
              reason = WIFI_DISCONNECT_REASONS[reasonIndex];
              log.info(`wifi disconnect reason: ${reason}`);
            }

            /**
             * This event is emitted when wifi is disconnected from an
             * access point
             *
             * @event disconnected
             * @memberof silk-wifi
             * @instance
             * @property {string} reason reason for disconnection
             */
            this.emit('disconnected', reason);
          }
          break;
        case 'CTRL-EVENT-SCAN-STARTED':
          break;
        case 'CTRL-EVENT-SCAN-RESULTS':
          this.emit('scanResults');
          break;
        case 'CTRL-EVENT-CONNECTED':
          /**
           * This event is emitted when wifi is connected to an access point
           *
           * @event connected
           * @memberof silk-wifi
           * @instance
           */
          this.emit('connected');
          break;
        case 'CTRL-EVENT-STATE-CHANGE':
          if ((found = extra.match(/ state=([0-9]) /))) {
            const stateIndex = Number(found[1]);
            const state = WIFI_STATE_MAP[stateIndex];
            log.info(`wifi state: ${state}`);

            /**
             * This event is emitted when there is a change in wifi state
             *
             * @event stateChange
             * @memberof silk-wifi
             * @instance
             * @type {Object}
             * @property {WifiState} state new wifi state
             */
            this.emit('stateChange', state);
          } else {
            log.warn(`Unable to parse ${cmd} extra: ${extra}`);
          }
          break;
        default:
          log.debug(`(ignored) ${cmd} | ${extra}`);
          break;
        }
        continue;
      }
      log.warn(`Error: Unknown wpad output: ${line}`);
    }
  }
}

function wpaCli(...args: Array<string>): Promise<string> {
  if (!monitor.ready()) {
    log.info('wpaCli: supplicant not ready, waiting');
    return util.timeout(1000).then(() => wpaCli(...args));
  }

  const bin = 'wpa_cli';
  const fullArgs = [`-i${iface}`, `IFNAME=${iface}`, ...args];

  return util.exec(bin, fullArgs).then((r) => {
    if (r.code !== 0) {
      const stdout = r.stdout.replace(/\n/g, '');
      throw new Error(
        `'${bin} ${fullArgs.join(' ')}' returned ${r.code}: '${stdout}'`
      );
    }
    return r.stdout;
  });
}

function wpaCliExpectOk(...args: Array<string>): Promise<void> {
  return wpaCli(...args).then((ok) => {
    if (ok.match(/^OK/)) {
      return;
    }
    const bin = 'wpa_cli';
    const fullArgs = [`-i${iface}`, `IFNAME=${iface}`, ...args];
    throw new Error(
      `'${bin} ${fullArgs.join(' ')}': '${ok.replace(/\n/g, '')}'`
    );
  });
}

function wpaCliGetNetworkIds(): Promise<Array<string>> {
  return wpaCli('list_networks').then((networkList) => {
    let ids = networkList.split('\n').map((netInfo) => {
      let found;
      if ((found = netInfo.match(/^([0-9]+)/))) {
        return found[1];
      }
      return ''; // will be filtered out
    });
    return ids.filter((id) => !!id);
  });
}

function wpaCliAddNetwork(): Promise<string> {
  return wpaCli('add_network').then((id) => {
    let found;
    if ((found = id.match(/^([0-9]+)/))) {
      return found[1];
    }

    const bin = 'wpa_cli';
    const fullArgs = [`-i${iface}`, `IFNAME=${iface}`, `add_network`];
    throw new Error(
      `'${bin} ${fullArgs.join(' ')}': '${id.replace(/\n/g, '')}'`
    );
  });
}

async function wpaCliRemoveNetwork(id: string): Promise<void> {
  await wpaCliExpectOk('remove_network', id);
  await wpaCliExpectOk('save_config');
}

function wpaCliRemoveAllNetworks(): Promise<void> {
  return wpaCliRemoveNetwork('all');
}

async function wpaCliGetCurrentNetworkSSID(): Promise<?string> {
  const networkList = await wpaCli('list_networks');
  const currentNetworkRegex = /^[0-9]+\t([^\t]+)\t[^\t]+\t.*\[CURRENT\].*$/;
  for (let line of networkList.split('\n')) {
    let found;
    if ((found = line.match(currentNetworkRegex))) {
      const ssid = unescapeSSID(found[1]);
      if (ssid.length === 0 || CTRL_CHARS_REGEX.test(ssid)) {
        continue;
      }
      return ssid;
    }
  }
  return null;
}

async function wpaCliGetCurrentNetworkRSSI(): Promise<?number> {
  const signalInfo = await wpaCli('signal_poll');
  const rssiRegex = /^RSSI=([-\d]+)$/;
  for (let line of signalInfo.split('\n')) {
    let found;
    if ((found = line.match(rssiRegex))) {
      const rssi = parseInt(found[1]);
      if (isNaN(rssi)) {
        continue;
      }
      return rssi;
    }
  }
  return null;
}

/**
 *  Silk wifi module
 *  @module silk-wifi
 *
 * @example
 * const wifi = require('silk-wifi').default;
 * const log = require('silk-alog');
 *
 * wifi.init()
 * .then(() => {
 *   return wifi.online();
 * })
 * .then(() => {
 *   log.info('Wifi initialized successfully');
 * })
 * .catch(err => {
 *   log.error('Failed to initialize wifi', err);
 * });
 */
export class Wifi extends EventEmitter {

  // Always start as offline until proven otherwise...
  _online: boolean = false;
  _shutdown: boolean = false;
  _scanTimer: ?number = null;
  _state: WifiState = 'disconnected';

  // Set when dhcp request is outstanding.
  _dhcpPromise: ?Promise<void> = null;

  // Used to cancel dhcp request.
  _dhcpAbortFunction: ?(() => void) = null;

  // Don't let Wifi get bogged down with its consumer's unhandled exceptions.
  emit(type: string, ...rest: Array<mixed>): boolean {
    let result = true;
    try {
      result = super.emit(type, ...rest);
    } catch (error) {
      log.warn(
        `Caught an unhandled exception while emitting '${type}' event`,
        error,
      );
      util.processthrow(error);
    }
    return result;
  }

  /**
   * Current wifi state.
   *
   * @memberof silk-wifi
   * @instance
   */
  get state(): WifiState {
    return this._state;
  }

  async _networkCleanup(): Promise<void> {
    // No longer "online".
    this._online = false;

    // Abort any async work that might be happening for dhcp.
    if (this._dhcpAbortFunction) {
      this._dhcpAbortFunction();
    }

    // Cleanup.
    this._dhcpPromise = null;
    this._dhcpAbortFunction = null;

    try {
      await execWarnOnNonZeroCode('dhcputil', [iface, 'dhcp_stop']);
      await execWarnOnNonZeroCode('ndc', ['network', 'destroy', '100']);
      await execWarnOnNonZeroCode('ndc', ['interface', 'clearaddrs', iface]);
      const {stdout} =
        await execWarnOnNonZeroCode('ndc', ['interface', 'getcfg', iface]);
      log.info(`${iface} state| ${stdout}`);
    } catch (error) {
      log.warn(`Network cleanup failed`, error);
    }
  }

  async _requestDhcp(): Promise<void> {
    // This promise never resolves, it only rejects if _dhcpAbortFunction is
    // called by _networkCleanup.
    const abortPromise = new Promise((_, reject) => {
      const abortFunction = () => {
        invariant(this._dhcpAbortFunction === abortFunction);
        this._dhcpAbortFunction = null;
        reject();
      };

      invariant(!this._dhcpAbortFunction);
      this._dhcpAbortFunction = abortFunction;
    });

    this.emit('stateChange', 'dhcping');

    let retryCount = 0;

    while (true) {                  // eslint-disable-line no-constant-condition
      const attempt = ++retryCount;
      if (attempt === 1) {
        log.info('Issuing DHCP request');
      } else {
        log.warn(`Retrying DHCP request, attempt #${attempt}`);
      }

      try {
        await requestDhcp(abortPromise);

        // If that didn't throw then we're done looping.
        break;
      } catch (error) {
        if (!error) {
          log.debug(`DHCP request canceled`);
          // Don't do anything else.
          return;
        }

        log.warn(
          `DHCP request failed, retrying in ${String(DHCP_TIMEOUT_MS)} ms`,
          error,
        );
      }

      let retryTimer: ?number = null;

      const sleep = new Promise((resolve) => {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          resolve();
        }, DHCP_TIMEOUT_MS);
      });

      try {
        await Promise.race([sleep, abortPromise]);
      } catch (error2) {
        // Must have been aborted.
        invariant(!error2);

        if (retryTimer) {
          log.warn(`Canceling DHCP retry timer`);
          clearTimeout(retryTimer);
        }

        // Don't do anything else.
        return;
      }

      // Try again.
    }

    log.info('==> Wifi online');
    this._online = true;

    /**
     * This event is emitted when the device is connected to the network
     *
     * @event online
     * @memberof silk-wifi
     * @instance
     */
    this.emit('online');
  }

  _startWpaMonitor(): Promise<void> {
    monitor = new WpaMonitor(iface);
    monitor.on('connected', () => {
      log.info('Wifi Connected.');

      invariant(!this._dhcpPromise);
      this._dhcpPromise = this._requestDhcp();
    });
    monitor.on('disconnected', (reason) => {
      log.info(`==> Wifi offline (${reason})`);

      this._networkCleanup();
      invariant(!this._dhcpPromise);

      // Send error unless leaving under normal circumstances
      if (reason !== 'deauth_leaving') {
        /**
         * This event is emitted to report an error
         *
         * @event error
         * @memberof silk-wifi
         * @instance
         * @type {Object}
         * @property {Error} error Error reason
         */
        this.emit('error', new Error(reason));
      }

      /**
       * This event is emitted when wifi is offline
       *
       * @event offline
       * @memberof silk-wifi
       * @instance
       */
      this.emit('offline');
      this.scan();
    });
    monitor.on('stateChange', (state) => {
      this._state = state;
      this.emit('stateChange', state);
    });
    monitor.on('scanResults', () => {
      this._emitScanResults().then(() => {
        this._scheduleScan();
      });
    });
    monitor.on('ssidTempDisabled', ssid => {
      this.emit('ssidTempDisabled', ssid);
    });
    monitor.on('ssidReenabled', ssid => {
      this.emit('ssidReenabled', ssid);
    });

    return Promise.resolve();
  }

  _scheduleScan() {
    if (this._scanTimer) {
      log.verbose(`Not scheduling a scan, already got one scheduled.`);
      return;
    }
    log.verbose(`Scheduling next scan in ${SCAN_INTERVAL_MS}ms.`);
    this._scanTimer = setTimeout(() => {
      this._scanTimer = null;
      if (this._online) {
        log.verbose(`We're online, not going to scan anymore.`);
        return;
      }
      if (this.state !== 'disconnected') {
        log.verbose(
          `Not going to scan while in state '${this.state}', postponing.`
        );
        this._scheduleScan();
        return;
      }
      this.scan();
    }, SCAN_INTERVAL_MS);
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
    if (util.getboolprop('persist.silk.wifi.excessivelog')) {
      await wpaCliExpectOk('log_level', 'excessive');
    }
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
  isOnline(): boolean {
    return this._online;
  }

  /**
   * Bring-up wifi subsystem online
   *
   * @memberof silk-wifi
   * @instance
   */
  online(): Promise<void> {
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
    if (this._scanTimer) {
      log.debug(`Clearing scan timer, we're about to scan.`);
      clearTimeout(this._scanTimer);
      this._scanTimer = null;
    }
    log.info('Issuing scan request');
    wpaCli('scan').catch((err) => {
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
    let bestNetworks: Map<string, ScanResult> = new Map();
    for (const line of lines) {
      let info = line.split('\t');
      if (info.length !== 5) {
        log.warn(`Unexpected wpa_cli scan result: "${line}"`);
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

      const key = `${ssid}\0${String(psk)}`;
      level = parseInt(level, 10);
      const existingNetwork = bestNetworks.get(key);
      if (existingNetwork && existingNetwork.level < level) {
        existingNetwork.level = level;
      } else {
        bestNetworks.set(key, {ssid, level, psk});
      }
    }

    // Rebuild scanResults with just the strongest ssids
    const scanResults: Array<ScanResult> = Array.from(bestNetworks.values());
    log.debug('scanResults', scanResults);

    /**
     * This event is emitted when result of wifi scan is available
     *
     * @event scanResults
     * @memberof silk-wifi
     * @instance
     * @type {Array<ScanResult>}
     * @property {string} ssid name of the network
     * @property {number} level signal level
     * @property {boolean} psk True if network requires WPA or PSK
     */
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

  networkConfigured(): Promise<void> {
    return wpaCliGetNetworkIds().then((ids) => {
      if (ids.length > 0) {
        // If any networks exist, then the device is 'configured'.
        return;
      }
      throw new Error('No network configured');
    });
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

  /**
  * Gather information about the current connection.
  *
  * @memberof silk-wifi
  * @instance
  */
  async getCurrentNetworkInfo(): Promise<?ConnectedNetworkInfo> {
    const ssid = await wpaCliGetCurrentNetworkSSID();
    invariant(ssid !== undefined);
    if (ssid === null) {
      return null;
    }

    const level = await wpaCliGetCurrentNetworkRSSI();
    invariant(level !== undefined);
    if (level === null) {
      return null;
    }

    if (!this.online) {
      // Make sure this agrees with |online|.
      return null;
    }

    return {
      ssid,
      level,
    };
  }
}

export class StubWifi extends EventEmitter {

  init(): Promise<void> {
    log.info('Using stub "WiFi"');
    if (!util.getboolprop('ro.kernel.qemu')) {
      return Promise.resolve();
    }

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
    return util.exec(
      'ndc',
      ['resolver', 'setnetdns', /*netId=*/'0', '.localhost', ...dns],
    ).then(() => {
      return;
    });
  }

  shutdown(): Promise<void> {
    log.info('Stub: "WiFi" shutdown');
    return Promise.resolve();
  }

  state: WifiState = 'completed';

  isOnline(): boolean {
    // Fingers crossed that somehow the device is online
    return true;
  }

  online(): Promise<void> {
    return Promise.resolve();
  }

  scan() {
    log.warn('StubWifi.scan not implemented');
  }

  joinNetwork(ssid: string, psk: ?string): Promise<void> { //eslint-disable-line
    return Promise.reject(new Error('StubWifi.joinNetwork not implemented'));
  }

  networkConfigured(): Promise<void> {
    return Promise.resolve();
  }

  forgetNetwork(): Promise<void> {
    log.warn('StubWifi.forgetNetwork not implemented');
    return Promise.resolve();
  }

  getCurrentNetworkInfo(): Promise<?ConnectedNetworkInfo> {
    log.warn('StubWifi.getCurrentNetworkInfo not implemented');
    return Promise.resolve(null);
  }
}

export default USE_WIFI_STUB ? new StubWifi() : new Wifi();
