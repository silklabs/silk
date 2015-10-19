import React from 'react-native';
let {
  NetInfo,
  View,
  StyleSheet,
} = React;

import socketIOClient from 'socket.io-client-react-native';
import createLog from 'log';

import SocketIO from '../libraries/SocketIO';
import Config from '../libraries/Config';
import DeviceManager from '../libraries/btle/DeviceManager';
import BLECentral from '../libraries/btle/BLECentral';
import { getWifiInfo } from '../libraries/Util';
import { UserState } from '../libraries/UserState';

import MonitorsView from './MonitorsView';
import NetworkWarning from './NetworkWarning';
import TopBar from './TopBar';

const log = createLog('Main');

export default class extends React.Component {

  static propTypes = {
    api: React.PropTypes.object.isRequired, // TODO: we can do better here
    userState: React.PropTypes.instanceOf(UserState).isRequired,
  };

  state = {
    hasNetwork: true,
    connectionState: 'connecting', // purposely optimistic default state
    socketConnectionState: 'offline',
    socketUrl: null,
    socket: null,
    wifi: Config.getDefault().wifi || null,
  };

  bleDeviceManager = null;
  socket = null;
  _wifiSettingsPromise = null;

  componentWillMount() {
    this.bleDeviceManager = new DeviceManager(
      BLECentral,
      this.props.userState,
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

    NetInfo.isConnected.fetch().then(this.onConnectivityChange);
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);
  }

  componentWillUnmount() {
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
    if (this.state.socket) {
      this.state.socket.close();
    }
  }

  onConnectivityChange = (hasNetwork) => {
    log.info('Network connectivity change. Can haz internet?', hasNetwork);
    if (!hasNetwork) {
      // Close the socket in case we have one, but don't get rid of it
      // so that the app still remains functional (apart from, you
      // know, not having any network connection).
      if (this.state.socket) {
        log.info('Closing old socket');
        this.state.socket.off();
        this.state.socket.close();
      }
      this.setState({
        hasNetwork,
        connectionState: 'offline',
        socketConnectionState: 'offline',
      });
      return;
    }
    // We have a network connection (again). Get rid of any old socket
    // that we might have kept around and (re-)connect.
    this.setState({
      hasNetwork,
      connectionState: 'connecting',
      socketUrl: null,
      socket: null,
    });
    this.props.api.socketio.address()
      .then(result => this.setSocketUrlAndConnect(result.url))
      .catch(err => {
        log.info('Unable to get server socket.io address', err);
        this.setState({
          connectionState: 'offline',
        });
      });
  };

  setSocketUrlAndConnect(socketUrl) {
    if (this.state.socket) {
      log.info('Closing old socket');
      this.state.socket.off();
      this.state.socket.close();
    }
    log.info('Going to connect to', socketUrl);
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
        autoConnect: true,
        forceNew: true,
        transports: ['websocket'],
      }));

      this.setState({
        socket,
        socketConnectionState: socket.connected ? 'connected' : 'connecting',
      });
      if (!socket.connected) {
        log.info('Connecting to ...', socketUrl);
        socket.on('connect', () => {
          log.info(' ... connected');
          this.setState({
            connectionState: 'connected',
            socketConnectionState: 'connected',
          });
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
      });
    } else {
      promise = getWifiInfo().then(info => {
        return this.navigateWifiScene({
          ssid: info.SSID,
          secret: '',
        });
      });
    }
    return promise.then(settings => {
      log.info('Saving settings', settings);
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
      this.props.navigator.pushAsync({
        name: 'WifiSettings',
        index: 1,
        props: {
          hints,
          resolve,
          reject,
        },
      });
    });
  }

  render() {
    return (
      <View style={styles.container}>
        <TopBar
          socketConnectionState={this.state.socketConnectionState}
          openSettings={() => this.loadSettings().catch(() => {})}
        />
        <NetworkWarning />
        <MonitorsView
          hasNetwork={this.state.hasNetwork}
          connectionState={this.state.connectionState}
          socket={this.state.socket}
          bleDeviceManager={this.bleDeviceManager}
          {...this.props}
        />
     </View>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
