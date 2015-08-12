/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import SystemButton from './SystemButton';
var React = require('react-native');
var {
  AppRegistry,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

var Config = require('../Libraries/Config')();
var SocketIO = require('./SocketIO');
var DeviceSetup = require('./DeviceSetup');
var MonitorPreview = require('./MonitorPreview');

var PERIPH_EVENTS = ['discover', 'connect', 'rssi', 'stateChange',
                     'disconnect'];

var api = require('silk-api-react-native')({
  serverUrl: Config.server.url
});

var MonitorsView = React.createClass({
  getInitialState: function() {
    return {
      configuring: { },
      streaming: { },
      network: null,
      serverConnection: 'offline',
      serverUrl: api.config.serverUrl
    };
  },

  componentWillMount: function() {
    this.connectServer();
    var DeviceManager = require('../btle/central-device-manager');
    this.dm = new DeviceManager(require('../btle/ble-central'), this);
    PERIPH_EVENTS.forEach(ev => this.dm.on(ev, this.refreshDeviceList));
    this.dm.start();
    this.getWifiPromise = null;
  },

  componentWillUnmount: function() {
    PERIPH_EVENTS.forEach(ev =>
                          this.dm.removeListener(ev, this.refreshDeviceList));
    this.socket.close();
  },

  render: function() {
    var configuring = Object.keys(this.state.configuring).map(key => {
      var device = this.state.configuring[key];
      return (<DeviceSetup key={key}
                           name={device.name} rssi={device.rssi} />);
    });
    var streaming = Object.keys(this.state.streaming).map(key => {
      var device = this.state.streaming[key];
      return (<MonitorPreview key={key} id={key} label={device.name}
                              api={api}
                              socket={this.socket}
                              navigator={this.props.navigator}
                              serverUrl={this.state.serverUrl}
                              logo={device.logo} />);
    });
    if (0 === configuring.length + streaming.length) {
      configuring = (<PlaceholderMessage />);
    }
    var connectionStyle = this.state.serverConnection + 'Indicator';
    return (
      <View style={styles.container}>
        <View style={styles.titleContainer}>
          <View style={styles.spacer}>
            <View style={styles[connectionStyle]} />
          </View>
          <Text style={styles.title}>Silk</Text>
          <View style={styles.spacer}>
            <TouchableOpacity onPress={this.loadSettings}>
              <View style={styles.settings}>
                <Image source={require('image!Settings')}
                       style={styles.icon} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.content}>
          <ScrollView style={styles.monitors}>
            {configuring}
            {streaming}
          </ScrollView>
        </View>
      </View>
    );
  },

  connectServer: function() {
    if (this.socket) {
      console.log('Closing old socket');
      // TODO: react-native-swift-socketio has some problems managing
      // socket instances; it appears to assume one global socket.  So
      // help it out by clearing out all our old listeners; at least
      // we won't be double-notified on new events.
      this.socket.handlers = {};
      this.socket.close();
    }
    this.socket = new SocketIO();
    this.socket.connect(this.state.serverUrl);
    this.state.serverConnection = 'connecting';
    this.setState(this.state);
    console.log('Connecting to ...', this.state.serverUrl);
    this.socket.on('connect', () => {
      console.log(' ... connected');
      this.state.serverConnection = 'connected';
      this.setState(this.state);
      this.socket.on('video-stream-new', msg => {
        this.state.streaming[msg.id] = { name: msg.name, logo: msg.logo };
        this.setState(this.state);
      });
      this.socket.on('video-stream-delete', msg => {
        delete this.state.streaming[msg.id];
        this.setState(this.state);
      });
      this.socket.emit('join', 'video-streams');
    });
  },

  loadSettings: function() {
    return (() => {
      if (this.state.network) {
        return this.navigateWifiScene({ ssid: this.state.network.ssid,
                                        secret: this.state.network.secret,
                                        serverUrl: this.state.serverUrl });
      }
      var net = require('../Libraries/Net');
      return net.getInfo().then(info => {
        return this.navigateWifiScene({ ssid: info.SSID,
                                        secret: '',
                                        serverUrl: this.state.serverUrl });
      });
    })().then(network => {
      this.state.network = network;
      if (this.getWifiPromise) {
        this.getWifiPromise = null;
      }
      if (this.state.serverUrl !== network.serverUrl) {
        console.log('WARNING: Switching server URL to', network.serverUrl);
        console.log('  This will break any open monitor streams.');
        this.state.serverUrl = network.serverUrl;
        this.connectServer();
      }
      this.setState(this.state);
      return network;
    });
  },

  navigateWifiScene: function(hints) {
    return new Promise((resolve, reject) => {
      this.props.navigator.push({ name: 'WifiSettings', index: 1,
                                  hints: hints,
                                  resolve: resolve, reject: reject });
    });
  },

  refreshDeviceList: function() {
    var configuring = this.state.configuring = {};
    var streaming = this.state.streaming;
    this.dm.enumerateDevices().forEach(p => {
      if ('registered' !== p.state) {
        // Device hasn't finished configuring yet.
        configuring[p.id] = { name: p.prettyName, rssi: p.rssi,
                              state: 'configuring' };
        return;
      }
      if (!(p.deviceId in streaming)) {
        // Device has sent us its ID, but we haven't observed a
        // server-sent event from the device yet.  Create a
        // starting-up placeholder widget for it that will be swapped
        // out once we get the device info from the server.
        streaming[p.deviceId] = { name: 'New Device' };
        return;
      }
    });
    this.setState(this.state);
  },

  getWifiNetwork: function() {
    if (this.state.network) {
      return Promise.resolve(this.state.network);
    }
    if (this.getWifiPromise) {
      return this.getWifiPromise;
    }
    this.getWifiPromise = this.loadSettings()
    this.getWifiPromise.catch(() => { this.getWifiPromise = null; });
    return this.getWifiPromise;
  },
});

var PlaceholderMessage = React.createClass({
  render: function() {
    return (
      <View style={styles.placeholderContainer}>
        <Text style={styles.placeholderText}>
          Connect SilkCam to get started
        </Text>
      </View>
    );
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleContainer: {
    backgroundColor: 'white',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingTop: 32,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    color: '#656569',
  },
  offlineIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#c8c7cc',
    backgroundColor: '#ce0000',
  },
  connectingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#c8c7cc',
    backgroundColor: '#f7d708',
  },
  connectedIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#c8c7cc',
    backgroundColor: '#9ccf31',
  },
  settings: {
    alignItems: 'flex-end',
    flex: 1,
    padding: 4,
  },
  icon: {
    // TODO: shouldn't have to specify this?
    width: 24,
    height: 24,
  },
  spacer: {
    flex: 1,
  },
  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 0.5,
    backgroundColor: 'white',
    flex: 1,
  },

  placeholderContainer: {
    padding: 10,
  },
  placeholderText: {
    color: '#bbbbbb',
    fontSize: 15,
    fontStyle: 'italic',
  },

  monitors: {
    paddingTop: 5,
    backgroundColor: '#e5eaec',
    flex: 1,
  },
});

module.exports = MonitorsView;
