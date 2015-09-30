import React from 'react-native';
let {
  View,
} = React;

import MonitorsView from './MonitorsView';
import TopBar from './TopBar';
import SocketIO from '../Libraries/SocketIO';

import DeviceManager from '../btle/central-device-manager';
import bleScanner from '../btle/ble-central';

import socketIOClient from 'socket.io-client-react-native';
import mkdebug from 'debug'; const debug = mkdebug('silk:TabsView');

export default class TabsView extends React.Component {

  state = {
    wifi: null,
    socketConnectionState: 'offline',
    socketUrl: null,
    socket: null,
  };
  bleDeviceManager = null;
  socket = null;
  _wifiSettingsPromise = null;

  componentWillMount() {
    this.bleDeviceManager = new DeviceManager(
      bleScanner,
      () => {
        if (this.state.wifi) {
          return Promise.resolve(this.state.wifi);
        }
        if (this._wifiSettingsPromise) {
          return this._wifiSettingsPromise;
        }
        this._wifiSettingsPromise = this.loadSettings();
        this._wifiSettingsPromise.catch(() => this._wifiSettingsPromise = null);
        return this._wifiSettingsPromise;
      }
    );
    this.bleDeviceManager.start();

    this.props.api.socketio.address()
      .then(result => this.setSocketUrlAndConnect(result.url))
      .catch(err => debug('Unable to get server socketio address', err));
  }

  componentWillUnmount() {
    if (this.state.socket) {
      this.state.socket.close();
    }
  }

  setSocketUrlAndConnect(socketUrl) {
    if (this.state.socket) {
      debug('Closing old socket');
      this.state.socket.off();
      this.state.socket.close();
    }
    debug('Going to connect to', socketUrl);
    this.setState({
      socketUrl,
      socket: null,
      socketConnectionState: 'offline',
    }, () => {
      // XXX: Hack to ensure we make the server happy (remove trailing slash).
      if (socketUrl[socketUrl.length - 1] === '/') {
        socketUrl = this.state.socketUrl.slice(0, -1);
      }

      let socket = new SocketIO(socketIOClient(socketUrl, {
        transports: ['websocket'],
      }));

      this.setState({
        socket,
        socketConnectionState: socket.connected ? 'connected' : 'connecting',
      });
      if (!socket.connected) {
        debug('Connecting to ...', socketUrl);
        socket.on('connect', () => {
          debug(' ... connected');
          this.setState({socketConnectionState: 'connected'});
        });
      }
    });
  }

  loadSettings() {
    let promise;
    if (this.state.wifi) {
      promise = this.navigateWifiScene({
        ssid: this.state.wifi.ssid,
        secret: this.state.wifi.secret,
        socketUrl: this.state.socketUrl,
      });
    } else {
      const net = require('../Libraries/Net');
      promise = net.getInfo().then(info => {
        return this.navigateWifiScene({
          ssid: info.SSID,
          secret: '',
          socketUrl: this.state.socketUrl,
        });
      });
    }
    return promise.then(settings => {
      debug('Settings saved', settings);
      if (this.state.socketUrl !== settings.socketUrl) {
        debug('WARNING: Switching socket URL to', settings.socketUrl);
        debug('  This will break any open monitor streams.');
        this.setSocketUrlAndConnect(settings.socketUrl);
      }
      let wifi = {
        ssid: settings.ssid,
        secret: settings.secret,
      };
      this.setState({wifi});
      return wifi;
    });
  }

  navigateWifiScene(hints) {
    return new Promise((resolve, reject) => {
      this.props.navigator.push({
        name: 'WifiSettings',
        index: 1,
        hints: hints,
        resolve: resolve,
        reject: reject,
      });
    });
  }

  render() {
    return (
      <View>
        <TopBar
          socketConnectionState={this.state.socketConnectionState}
          openSettings={() => this.loadSettings().catch(() => {})}
        />
        <MonitorsView
          socket={this.state.socket}
          bleDeviceManager={this.bleDeviceManager}
          {...this.props}
        />
     </View>
    );
  }

}
