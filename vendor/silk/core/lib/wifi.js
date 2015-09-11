/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let util = require('./util');
let events = require('events');
let net = require('net');
let log = require('./log')('wifi');
let caps = require('./caps');

let iface = util.getprop('wifi.interface');
let monitor;

class WpaMonitor extends events.EventEmitter
{
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
            // ref: external/wpa_supplicant_8/src/common/ieee802_11_defs.h
            let reasonIndex = found[1];
            reason = ['invalid_0', 'unspecified', 'prev_auth_not_valid',
                'deauth_leaving', 'disassoc_due_to_inactivity',
                'disassoc_ap_busy', 'class2_frame_from_nonauth_sta',
                'class3_frame_from_nonassoc_sta', 'disassoc_sta_has_left',
                'sta_req_assoc_without_auth', 'pwr_capability_not_valid',
                'supported_channel_not_valid', 'invalid_12', 'invalid_ie',
                'michael_mic_failure', '4way_handshake_timeout',
                'group_key_update_timeout', 'ie_in_4way_differs',
                'group_cipher_not_valid', 'pairwise_cipher_not_valid',
                'akmp_not_valid', 'unsupported_rsn_ie_version',
                'invalid_rsn_ie_capab', 'ieee_802_1x_auth_failed',
                'cipher_suite_rejected', 'tdls_teardown_unreachable',
                'tdls_teardown_unspecified', 'invalid_27', 'invalid_28',
                'invalid_29', 'invalid_30', 'invalid_31', 'invalid_32',
                'invalid_33', 'disassoc_low_ack'][reasonIndex];
            log.info(`wifi disconnect reason: ${reason}`);
          }
          this.emit('disconnected', reason);
          break;
        case 'CTRL-EVENT-CONNECTED':
          this.emit('connected');
          break;
        case 'CTRL-EVENT-STATE-CHANGE':
          if ((found = extra.match(/ state=([0-9]) /))) {
            // ref: external/wpa_supplicant_8/src/common/defs.h
            let stateIndex = found[1];
            let state = ['disconnected', 'disabled', 'inactive', 'scanning',
             'authenticating', 'associating', 'associated', 'four_way_handshake',
             'group_handshake', 'completed'][stateIndex];
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

  return util.exec('wpa_cli', [`-i${iface}`, `IFNAME=${iface}`, ...args])
    .then(r => {
      if (r.code !== 0) {
        return Promise.reject(r.stdout);
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
      return Promise.reject(ok);
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
      return Promise.reject(id);
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


class Wifi extends events.EventEmitter
{
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
        let dnsN = util.getprop(`dhcp.${iface}.dns${i}`);
        if (dnsN) {
          dns.push(dnsN);
        }
      }

      let ipaddress = util.getprop(`dhcp.${iface}.ipaddress`);
      let mask = util.getprop(`dhcp.${iface}.mask`);
      let gateway = util.getprop(`dhcp.${iface}.gateway`);
      let domain = util.getprop(`dhcp.${iface}.domain`);
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

  _startWpaMonitor() {

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
    util.setprop('net.hostname', 'silk-' + util.getprop('ro.serialno'));

    // add 'error' listener in case no one else is, else node throws exception
    this.on('error', () => {});

    return this._networkCleanup()
      .then(() => this._startWpaMonitor())
      .then(() => wpaCli('status'))
      .then(() => wpaCliExpectOk('log_level', 'excessive'))
      .then(() => {
        log.info('WiFi initialization complete');
        return Promise.resolve();
      });
  }

  online() {
    if (this._online) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.once('online', resolve);
    });
  }

  joinNetwork(ssid, psk) {
    return wpaCliRemoveAllNetworks()
      .then(wpaCliAddNetwork)
      .then(id => {
        return wpaCliExpectOk('set_network', id, 'ssid', `"${ssid}"`)
          .then(() => wpaCliExpectOk('set_network', id, 'psk', `"${psk}"`))
          .then(() => wpaCliExpectOk('enable_network', id))
          .then(() => wpaCliExpectOk('save_config'));
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
    return wpaCliRemoveAllNetworks()
      .then(() => wpaCliExpectOk('disconnect'));
  }
}


class QEmuWifi extends events.EventEmitter
{
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
      let dnsN = util.getprop(`net.eth0.dns${i}`);
      if (dnsN) {
        dns.push(dnsN);
      }
    }
    return util.exec('ndc', ['resolver', 'setnetdns', /*netId=*/'0', '.localhost', ...dns]);
  }

  online() {
    return Promise.resolve();
  }

  joinNetwork(ssid, psk) { //eslint-disable-line
    log.error('joinNetwork not implemented');
  }

  networkConfigured() {
    return Promise.resolve();
  }

  forgetNetwork() {
    log.error('forgetNetwork not implemented');
  }
}

module.exports = caps.has('qemu') ? new QEmuWifi() : new Wifi();
