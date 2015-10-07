import React from 'react-native';
let {
  View,
  StyleSheet,
  TabBarIOS,
} = React;

import socketIOClient from 'socket.io-client-react-native';
import mklog from 'log'; const log = mklog('TabsView');

import SocketIO from '../libraries/SocketIO';
import Config from '../libraries/Config';
import DeviceManager from '../libraries/btle/DeviceManager';
import BLECentral from '../libraries/btle/BLECentral';

import MonitorsView from './MonitorsView';
import TopBar from './TopBar';

export default class TabsView extends React.Component {

  state = {
    selectedTab: 'monitors',
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
      .catch(err => log.info('Unable to get server socketio address', err));
  }

  componentWillUnmount() {
    if (this.state.socket) {
      this.state.socket.close();
    }
  }

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
          this.setState({socketConnectionState: 'connected'});
        });
      }
    });
  }

  loadSettings() {
    let promise;
    let serverUrl = Config.get().server.url || null;
    if (this.state.wifi) {
      promise = this.navigateWifiScene({
        ssid: this.state.wifi.ssid,
        secret: this.state.wifi.secret,
        serverUrl,
      });
    } else {
      const net = require('../libraries/Net');
      promise = net.getInfo().then(info => {
        return this.navigateWifiScene({
          ssid: info.SSID,
          secret: '',
          serverUrl,
        });
      });
    }
    return promise.then(settings => {
      log.info('Saving settings', settings);

      if (serverUrl !== settings.serverUrl) {
        Config.set({server: {url: settings.serverUrl}});
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
      this.props.navigator.pushAsync({
        name: 'WifiSettings',
        index: 1,
        hints: hints,
        resolve: resolve,
        reject: reject,
      });
    });
  }


  _renderTabs() {
    return (
      <TabBarIOS
        tintColor="white"
        barTintColor="#404e55">

        <TabBarIOS.Item
          title="Overview"
          icon={require('image!Tab.png')}
          selected={this.state.selectedTab === 'monitors'}
          onPress={() => this.setState({ selectedTab: 'monitors' })}>
          <MonitorsView
            socket={this.state.socket}
            bleDeviceManager={this.bleDeviceManager}
            {...this.props}
          />
        </TabBarIOS.Item>

        <TabBarIOS.Item
          title="Activity"
          icon={require('image!Tab.png')}
          selected={this.state.selectedTab === 'activity'}
          onPress={() => this.setState({ selectedTab: 'activity' })}>
          <View />
        </TabBarIOS.Item>

        <TabBarIOS.Item
          title="Profile"
          icon={require('image!Tab.png')}
          selected={this.state.selectedTab === 'profile'}
          onPress={() => this.setState({ selectedTab: 'profile' })}>
          <View />
        </TabBarIOS.Item>

      </TabBarIOS>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        <TopBar
          socketConnectionState={this.state.socketConnectionState}
          openSettings={() => this.loadSettings().catch(() => {})}
        />
        {this._renderTabs()}
     </View>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
