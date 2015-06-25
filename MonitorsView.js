/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

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

var SocketIO = require('react-native-swift-socketio');

// TODO import silk-api
var SERVER_URL = '192.168.2.1:5000';

var DeviceSetup = require('./DeviceSetup');
var MonitorPreview = require('./MonitorPreview');

var PERIPH_EVENTS = ['discover', 'connect', 'rssi', 'stateChange',
                     'disconnect'];

var MonitorsView = React.createClass({
  getInitialState: function() {
    return {
      configuring: { },
      streaming: { },
      network: null,
      serverConnection: 'offline',
    };
  },

  componentWillMount: function() {
    this.socket = new SocketIO(SERVER_URL);
    this.socket.connect();
    this.state.serverConnection = 'connecting';
    this.setState(this.state);
    console.log('Connecting to ...', SERVER_URL);
    this.socket.on('connect', () => {
      console.log(' ... connected');
      this.state.serverConnection = 'connected';
      this.setState(this.state);
      this.socket.on('video-stream-new', msga => {
        var msg = msga[0];
        this.state.streaming[msg.id] = { name: msg.name };
        this.setState(this.state);
      });
      this.socket.on('video-stream-delete', msga => {
        var msg = msga[0];
        delete this.state.streaming[msg.id];
        this.setState(this.state);
      });
      this.socket.emit('join', 'video-streams');
    });

    var DeviceManager = require('./btle/central-device-manager');
    this.dm = new DeviceManager(require('./btle/ble-central'), this);
    PERIPH_EVENTS.forEach(ev => this.dm.on(ev, this.refreshDeviceList));
    this.dm.start();
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
      return (<MonitorPreview key={key} vid={key} label={device.name}
                              serverUrl={SERVER_URL} />);
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

  loadSettings: function() {
    return (() => {
      if (this.state.network) {
        return this.navigateWifiScene(this.state.network.ssid,
                                      this.state.network.secret);
      }
      var net = require('./net');
      return net.getInfo().then(info => {
        return this.navigateWifiScene(info.SSID);
      });
    })().then(network => {
      this.state.network = network;
      this.setState(this.state);
      return network;
    });
  },

  navigateWifiScene: function(ssidHint, pskHint) {
    return new Promise((resolve, reject) => {
      this.props.navigator.push({ name: 'WifiSettings', index: 1,
                                  ssidHint: ssidHint || 'Network Name',
                                  pskHint: pskHint || 'silkysmooth',
                                  resolve: resolve, reject: reject });
    });
  },

  refreshDeviceList: function() {
    var configuring = this.state.configuring = {};
    this.dm.enumerateDevices().forEach(p => {
      configuring[p.id] = { name: p.prettyName, rssi: p.rssi,
                            state: 'configuring' };
    });
    this.setState(this.state);
  },

  getWifiNetwork: function() {
    if (this.state.network) {
      return Promise.resolve(this.state.network);
    }
    return this.loadSettings();
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
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#c8c7cc',
    backgroundColor: '#ce0000',
  },
  connectingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#c8c7cc',
    backgroundColor: '#f7d708',
  },
  connectedIndicator: {
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 2,
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
