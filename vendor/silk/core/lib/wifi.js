/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let caps = require('./caps');
let util = require('./util');
let events = require('events');
let spawn = require('child_process').spawn;

let iface = util.getprop('wifi.interface');
let monitor;
let wifi;

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
    if (this._wpaMonitor) {
      this._ready = false;
      this._wpaMonitor.kill();
      this._wpaMonitor = null;

      console.log(`wpa_monitor restart: ${why}`);
      util.timeout(1000).then(() => {
        this._init();
      });
      return;
    }

    console.log(`wpa_monitor restart pending (ignored "${why}")`);
  }

  _init() {
    console.log('Starting wpa_monitor');
    this._buffer = '';
    this._wpaMonitor = spawn('/system/bin/wpa_monitor');
    this._wpaMonitor.on('close', err => this._restart(`wpa_monitor process closed: ${err}`) );
    this._wpaMonitor.on('error', err => this._restart(`wpa_monitor prcess error: ${err}`) );
    this._wpaMonitor.stdout.on('data', d => this._onStdoutData(d));
  }

  _onStdoutData(data) {
    this._buffer += data.toString();
    this._ready = true;

    let newLineIndex;
    while ((newLineIndex = this._buffer.indexOf('\n')) !== -1) {
      let line = this._buffer.substring(0, newLineIndex);

      if (line[line.length - 1] === '\r') {
        line = line.slice(0, -1);
      }
      this._buffer = this._buffer.substring(newLineIndex + 1);

      //console.log(`raw line: ${line}`);

      let found;
      if ((found = line.match(/^!!>(.*)/))) {
        this._restart(`wpa_monitor error: ${found[1]}`);
        return;
      }
      if ((found = line.match(/^[0-9a-f]{2}>IFNAME=([^ ]+) ([^ ]+) (.*)/))) {
        let [, _iface, cmd, extra] = found;
        if (iface !== _iface) {
          console.log(`Ignoring command from unknown interface ${_iface}: ${cmd}`);
          continue;
        }

        switch (cmd) {
        case 'CTRL-EVENT-TERMINATING':
          this._restart(cmd);
          break;
        case 'CTRL-EVENT-DISCONNECTED':
          this.emit('disconnected');
          break;
        case 'CTRL-EVENT-CONNECTED':
          this.emit('connected');
          break;
        case 'CTRL-EVENT-STATE-CHANGE':
          if ((found = extra.match(/ state=([0-9]) /))) {
            let stateIndex = found[1];
            let state = ['disconnected', 'disabled', 'inactive', 'scanning',
             'authenticating', 'associating', 'associated', 'four_way_handshake',
             'group_handshake', 'completed'][stateIndex];
            console.log(`wifi state: ${state}`);
          }
          break;
        default:
          console.log(`(ignored) ${cmd} | ${extra}`);
          break;
        }
        continue;
      }
      console.error(`Error: Unknown wpa_monitor output: ${line}`);
    }
  }
}

function wpaCli(...args) {
  if (!monitor.ready()) {
    console.log('wpaCli: supplicant not ready, waiting');
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
  }

  _networkCleanup() {
    return util.exec('dhcputil', [iface, 'dhcp_stop'])
      .then(() => util.exec('ndc', ['network', 'destroy', '100']))
      .then(() => util.exec('ndc', ['interface', 'clearaddr', iface]))
      .then(() => {
        if (caps.has('wifi-needs-fwreload')) {
          return util.exec('ndc', ['softap', 'fwreload', iface, 'AP']);
        }
        return Promise.resolve();
      })
      .then(() => util.exec('ndc', ['interface', 'getcfg', iface]))
      .then(r => {
        console.log(`${iface} state| ${r.stdout}`);
      })
      .catch(err => {
        console.log(`Error: Network cleanup failed: ${err}`);
      });
  }

  _startWpaMonitor() {

    monitor = new WpaMonitor(iface);
    monitor.on('connected', () => {
      console.log('==> Wifi Connected. Issuing DHCP request');

      util.exec('dhcputil', [iface, 'dhcp_request'])
      .then(() => {

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
        console.log(`DHCP configuration:\nipaddress: ${ipaddress}/${mask}\n` +
                    `dns: ${dns}\ngateway: ${gateway}\ndomain: ${domain}\n`);

        // Add basic routing table and DNS
        return Promise.resolve()
          .then(() => util.exec('ndc', ['network', 'destroy', '100']))
          .then(() => util.exec('ndc', ['network', 'create', '100']))
          .then(() => util.exec('ndc', ['network', 'interface', 'add', '100', iface]))
          .then(() => util.exec('ndc', ['network', 'route', 'add', '100', iface, '0.0.0.0/0', gateway]))
          .then(() => util.exec('ndc', ['network', 'default', 'set', '100']))
          .then(() => util.exec('ndc', ['resolver', 'setnetdns', '100', domain, ...dns]))
          .then(() => util.exec('ndc', ['interface', 'getcfg', iface]));
      })
      .then(r => {
        console.log(`${iface} state| ${r.stdout}`);
      })
      .catch(err => {
        console.log(`Error: DHCP request failed: ${err}`);
      });

    });
    monitor.on('disconnected', () => {
      console.log('==> Wifi Disconnected');
      this._networkCleanup();
    });

    return Promise.resolve();
  }

  init() {
    console.log('WiFi initializing');

    // Set the device hostname to something that is probably unique
    util.setprop('net.hostname', 'silk-' + util.getprop('ro.serialno'));

    return this._networkCleanup()
      .then(() => this._startWpaMonitor())
      .then(() => wpaCli('status'))
      .then(() => wpaCliExpectOk('log_level', 'excessive'))
      .then(() => {
        console.log('WiFi initialization complete');
        return Promise.resolve();
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
    return wpaCliRemoveAllNetworks();
  }
}

wifi = new Wifi();
module.exports = wifi;
