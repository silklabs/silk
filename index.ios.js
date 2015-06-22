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
  View,
} = React;

var SocketIO = require('react-native-swift-socketio');

// TODO import weave-api
var SERVER_URL = 'localhost:5000';

var DeviceSetup = require('./DeviceSetup');
var MonitorPreview = require('./MonitorPreview');

var PERIPH_EVENTS = ['discover', 'connect', 'rssi', 'stateChange',
                     'disconnect'];

var Silk = React.createClass({
  getInitialState: function() {
    return { configuring: { }, streaming: { } };
  },

  componentWillMount: function() {
    this.socket = new SocketIO(SERVER_URL);
    this.socket.connect();
    console.log('Connecting to ...', SERVER_URL);
    this.socket.on('connect', () => {
      console.log(' ... connected');
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
    return (
      <View style={styles.container}>
        <View style={styles.titleContainer}>
          <View style={styles.spacer} />
          <Text style={styles.title}>Silk</Text>
          <View style={styles.spacer}>
            <View style={styles.settings}>
              <Image source={require('image!Settings')} style={styles.icon} />
            </View>
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

  refreshDeviceList: function() {
    var configuring = this.state.configuring = {};
    this.dm.enumerateDevices().forEach(p => {
      configuring[p.id] = { name: p.prettyName, rssi: p.rssi,
                            state: 'configuring' };
    });
    this.setState(this.state);
  },

  getWifiNetwork: function() {
    return Promise.resolve({ ssid: 'Hello', secret: 'kitty' });
    /*
    var self = this;
    return secureStorage.get('wifi').then(function(value) {
      return JSON.parse(value);
    }, function(err) {
      console.log('Prompting for wifi because "'+ err +'"');
      if (!self.wifiPromptPromise) {
        self.wifiPromptPromise = new Promise(function(resolve, reject) {
          self.setState({ showWifiPrompt: true });
          self.resolveWifiPrompt = resolve;
        });
      }
      return self.wifiPromptPromise;
    });
     */
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
    paddingTop: 30,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 5,
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    color: '#656569',
  },
  settings: {
    alignItems: 'flex-end',
    flex: 1,
    padding: 4,
  },
  icon: {
    // TODO: shouldn't have to specify this?
    width: 20,
    height: 20,
  },
  spacer: {
    flex: 1,
  },
  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 1,
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

AppRegistry.registerComponent('Silk', () => Silk);
