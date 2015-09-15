/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

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

var Config = require('../Libraries/Config');
var SocketIO = require('../Libraries/SocketIO');
var DeviceSetup = require('./DeviceSetup');
var MonitorPreview = require('./MonitorPreview');
var io = require('socket.io-client-react-native');
var debug = require('debug')('silk:MonitorPreview');

import { CameraMarkText, PlaceholderText } from './Text';

var PERIPH_EVENTS = ['discover', 'connect', 'rssi', 'stateChange',
                     'disconnect', 'errorChange', 'statusChange'];

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
      serverUrl: null
    };
  },

  componentWillMount: function() {
    var DeviceManager = require('../btle/central-device-manager');
    this.dm = new DeviceManager(require('../btle/ble-central'), this);
    PERIPH_EVENTS.forEach(ev => this.dm.on(ev, this.refreshDeviceList));
    this.dm.start();
    this.getWifiPromise = null;

    api.socketio.address().then(result => {
      this.state.serverUrl = result.url;
      this.connectServer();
    });
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
                              status={device.status}
                              api={api}
                              socket={this.socket}
                              navigator={this.props.navigator}
                              serverUrl={this.state.serverUrl}
                              logo={device.logo}
                              previewSize = {device.previewSize}/>);
    });
    if (0 === configuring.length + streaming.length) {
      configuring = (<PlaceholderMessage />);
    }
    var connectionStyle = this.state.serverConnection + 'Indicator';
    return (
      <View style={styles.container}>
        <View style={styles.statusBarUnderlay} />
        <View style={styles.titleContainer}>
          <View style={styles.spacer}>
            <TouchableOpacity onPress={this.loadSettings}>
              <View style={styles.settings}>
                <Image source={require('image!Menu')}
                       style={styles.icon} />
              </View>
            </TouchableOpacity>
          </View>
          <CameraMarkText />
          <View style={styles.spacer}>
            <View style={styles.indicatorContainer}>
              <View style={styles[connectionStyle]} />
            </View>
          </View>
        </View>
        <View style={styles.content}>
          <ScrollView style={styles.monitors}
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
      transports: ['websocket']
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
 
        this.state.streaming[msg.id] = { name: msg.name, logo: msg.logo,
            previewSize: msg.previewSize, status: status };

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
        debug('WARNING: Switching server URL to', network.serverUrl);
        debug('  This will break any open monitor streams.');
        this.state.serverUrl = network.serverUrl;
        this.connectServer();
      }
      this.setState(this.state);
      return network;
    }).catch(() => undefined); // Cancel button = promise rejection = ignore.
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
      if ('unregistered' === p.state || 'registering' === p.state) {
        // Show configuring widget when we are registering
        configuring[p.id] = { name: p.prettyName, rssi: p.rssi,
                              state: p.state, error: p.error };
        return;
      } else if ('registered' === p.state) {
        // Device is registered...
        if (!(p.deviceId in streaming)) {
          // Device has sent us its ID, but we haven't observed a
          // server-sent event from the device yet. Create a
          // starting-up placeholder widget for it that will be swapped
          // out once we get the device info from the server. Will need
          // remove if server-sent event never received.
          streaming[p.deviceId] = { name: 'New Device', placeholder: true };
        }

        // update status, use error message if exists
        streaming[p.deviceId].status = 
            p.error ? p.error : p.serverConnectionStatus;
      }
    });

    
    for (let id in streaming) {
      if (!this.dm.enumerateDevices().some(p => p.deviceId === id)) {
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
    }
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
        <PlaceholderText>
          Connect Silk Cam to get started
        </PlaceholderText>
      </View>
    );
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBarUnderlay: {
    height: 20,
    backgroundColor: '#404e55',
  },
  titleContainer: {
    backgroundColor: '#2b3a42',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingTop: 10,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
  },
  indicatorContainer: {
    // For some reason cjones was unable to make this `flex` fill
    // available vertical space inside the title container (when
    // changing the flex direction back to col).  So hack around that
    // by hard-coding a fixed height.
    //
    //flex: 1,
    height: 25,
    alignItems: 'flex-end',
    justifyContent: 'center',
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
    flex: 1,
    paddingLeft: 4,
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

  monitors: {
    paddingTop: 5,
    backgroundColor: '#efefef',
    flex: 1,
  },
});

module.exports = MonitorsView;
