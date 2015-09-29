/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
var {
  ScrollView,
  StyleSheet,
  View,
} = React;

var Config = require('../Libraries/Config');
var SocketIO = require('../Libraries/SocketIO');
var DeviceSetup = require('./DeviceSetup');
import { MonitorConnecting, MonitorPreview } from './MonitorPreview';
var io = require('socket.io-client-react-native');
var debug = require('debug')('silk:MonitorPreview');

import { PlaceholderText } from './Text';
import TopBar from './TopBar';

const DeviceManager = require('../btle/central-device-manager');
const bleScanner = require('../btle/ble-central');

var PERIPH_EVENTS = [
  'discover',
  'connect',
  'rssi',
  'stateChange',
  'disconnect',
  'errorChange',
  'statusChange',
];

var api = require('silk-api-react-native')({
  serverUrl: Config.server.url,
});


var MonitorsView = React.createClass({
  getInitialState: function() {
    return {
      configuring: {},
      streaming: {},
      network: null,
      serverConnection: 'offline',
      serverUrl: null,
    };
  },

  componentWillMount: function() {
    this.dm = new DeviceManager(
      bleScanner,
      () => {
        if (this.state.network) {
          return Promise.resolve(this.state.network);
        }
        if (this._wifiSettingsPromise) {
          return this._wifiSettingsPromise;
        }
        this._wifiSettingsPromise = this.loadSettings();
        this._wifiSettingsPromise.catch(() => this._wifiSettingsPromise = null);
        return this._wifiSettingsPromise;
      }
    );

    PERIPH_EVENTS.forEach(ev => this.dm.on(ev, this.refreshDeviceList));
    this.dm.start();
    this._wifiSettingsPromise = null;

    api.socketio.address().then(result => {
      this.state.serverUrl = result.url;
      this.connectServer();
    }, err => debug('Unable to get server socketio address', err));
  },

  componentWillUnmount: function() {
    PERIPH_EVENTS.forEach(ev => this.dm.removeListener(ev, this.refreshDeviceList));
    if (this.socket) {
      this.socket.close();
    }
  },

  render: function() {
    var configuring = Object.keys(this.state.configuring).map(key => {
      var device = this.state.configuring[key];
      return <DeviceSetup key={key} name={device.name} rssi={device.rssi} />;
    });
    var streaming = Object.keys(this.state.streaming).map(key => {
      var device = this.state.streaming[key];
      if (device.placeholder) {
        return <MonitorConnecting key={key} status={device.status} />;
      }
      return (
        <MonitorPreview
          key={key}
          id={key}
          label={device.name}
          status={device.status}
          api={api}
          socket={this.socket}
          navigator={this.props.navigator}
          logo={device.logo}
          previewSize = {device.previewSize}
        />
      );
    });
    if (0 === configuring.length + streaming.length) {
      configuring = <PlaceholderMessage />;
    }
    return (
      <View style={styles.container}>
        <TopBar
          serverConnectionState={this.state.serverConnection}
          openSettings={() => this.loadSettings().catch(() => {})}
        />
        <View style={styles.content}>
          <ScrollView
            style={styles.monitors}
            automaticallyAdjustContentInsets={false}>
            {configuring}
            {streaming}
          </ScrollView>
        </View>
      </View>
    );
  },

  connectServer: function() {
    if (this.socket) {
      debug('Closing old socket');
      // TODO: react-native-swift-socketio has some problems managing
      // socket instances; it appears to assume one global socket.  So
      // help it out by clearing out all our old listeners; at least
      // we won't be double-notified on new events.
      this.socket.handlers = {};
      this.socket.close();
    }

    // XXX: Hack to ensure we make the server happy (remove trailing slash).
    let serverUrl = this.state.serverUrl;
    if (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = this.state.serverUrl.slice(0, -1);
    }

    this.socket = new SocketIO(io(serverUrl, {
      transports: ['websocket'],
    }));

    this.state.serverConnection = 'connecting';
    this.setState(this.state);
    debug('Connecting to ...', this.state.serverUrl);
    this.socket.on('connect', () => {
      debug(' ... connected');
      this.state.serverConnection = 'connected';
      this.setState(this.state);

      this.socket.on('video-stream-new', msg => {
        debug('new video stream', msg.id);

        // use device status from discovered peripheral if available
        let device = this.state.streaming[msg.id];
        let status = (device && device.status) ? device.status : '';

        this.state.streaming[msg.id] = {
          name: msg.name,
          logo: msg.logo,
          previewSize: msg.previewSize,
          status: status,
        };

        this.setState(this.state);
      });
      this.socket.on('video-stream-delete', msg => {
        debug('deleted video stream', msg.id);
        delete this.state.streaming[msg.id];
        this.setState(this.state);
      });
      this.socket.emit('join', 'video-streams');
    });
  },

  loadSettings: function() {
    let promise;
    if (this.state.network) {
      promise = this.navigateWifiScene({
        ssid: this.state.network.ssid,
        secret: this.state.network.secret,
        serverUrl: this.state.serverUrl,
      });
    } else {
      const net = require('../Libraries/Net');
      promise = net.getInfo().then(info => {
        return this.navigateWifiScene({
          ssid: info.SSID,
          secret: '',
          serverUrl: this.state.serverUrl,
        });
      });
    }
    return promise.then(network => {
      this.state.network = network;
      if (this._wifiSettingsPromise) {
        this._wifiSettingsPromise = null;
      }
      if (this.state.serverUrl !== network.serverUrl) {
        debug('WARNING: Switching server URL to', network.serverUrl);
        debug('  This will break any open monitor streams.');
        this.state.serverUrl = network.serverUrl;
        this.connectServer();
      }
      this.setState(this.state);
      return network;
    });
  },

  navigateWifiScene: function(hints) {
    return new Promise((resolve, reject) => {
      this.props.navigator.push({
        name: 'WifiSettings',
        index: 1,
        hints: hints,
        resolve: resolve,
        reject: reject,
      });
    });
  },

  refreshDeviceList: function() {
    var configuring = this.state.configuring = {};
    var streaming = this.state.streaming;
    this.dm.enumerateDevices().forEach(p => {
      if ('unregistered' === p.state || 'registering' === p.state) {
        // Show configuring widget when we are registering
        configuring[p.id] = {
          name: p.prettyName,
          rssi: p.rssi,
          state: p.state,
          error: p.error,
        };
        return;
      }
      if ('registered' === p.state) {
        // Device is registered...
        if (!(p.deviceId in streaming)) {
          // Device has sent us its ID, but we haven't observed a
          // server-sent event from the device yet. Create a
          // starting-up placeholder widget for it that will be swapped
          // out once we get the device info from the server. Will need
          // remove if server-sent event never received.
          streaming[p.deviceId] = {
            name: 'New Device',
            placeholder: true,
          };
        }

        // update status, use error message if exists
        streaming[p.deviceId].status =
            p.error ? p.error : p.serverConnectionStatus;
      }
    });

    Object.keys(streaming).forEach(id => {
      if (!this.dm.enumerateDevices().some(
          p => p.deviceId === id && p.state !== 'disconnected')) {
        // Streaming widget still exists, but we are no longer connected
        // to the peripheral. Let's do some cleanup...

        // No longer receiving status update (over BLE), so clear status to not
        // show potentially stale data
        streaming[id].status = '';

        // We have not received a server-sent event. Delete placeholder widget,
        // less, it will linger indefinitely. If/when the server sends the
        // event, it will get added back in.
        if (streaming[id].placeholder) {
          delete streaming[id];
        }
      }
    });
    this.setState(this.state);
  },

});

var PlaceholderMessage = React.createClass({
  render: function() {
    return (
      <View style={styles.placeholderContainer}>
        <PlaceholderText>
          Connect Silk Cam to get started
        </PlaceholderText>
      </View>
    );
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 0.5,
    backgroundColor: 'white',
    flex: 1,
  },

  monitors: {
    paddingTop: 5,
    backgroundColor: '#efefef',
    flex: 1,
  },
});

module.exports = MonitorsView;
