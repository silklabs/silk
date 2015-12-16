import React from 'react-native';
import { SilkApi } from 'silk-api';
import socketIOClient from 'socket.io-client-react-native';
import createLog from 'log';

import SocketIO from '../../libraries/SocketIO';
import AsyncComponent from './AsyncComponent';

const {
  NetInfo,
} = React;

const log = createLog('ServerConnectivity');

/**
 * Establish and maintain the connection to the server.
 */
export default class ServerConnectivity extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    component: React.PropTypes.func.isRequired,
  };

  mounted = false;

  state = {
    hasNetwork: true,
    socketConnectionState: 'offline',
    socket: null,
  };

  componentWillMount() {
    log.info('PROPS', Object.keys(this.props));
    this.mounted = true;
    this.onConnectivityChange();
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);
  }

  componentWillUnmount() {
    this.mounted = false;
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
    if (this.state.socket) {
      this.state.socket.close();
    }
  }

  onConnectivityChange = async () => {
    let hasNetwork = await this.props.api.canReachServer();
    if (!hasNetwork) {
      this.setStateAsync({
        hasNetwork: false,
        socketConnectionState: 'offline',
        socket: null,
      });
      return;
    }
    this.connectSocketIO();
  };

  async connectSocketIO() {
    await this.setStateAsync({
      hasNetwork: true,
      socket: null,
      socketConnectionState: 'offline',
    });

    let {api} = this.props;
    let socket = new SocketIO(api.socketioClient(socketIOClient, 'account', {
      forceNew: true,
    }));

    socket.on('error', (error) => {
      log.info('Socket error', error);
      this.setStateAsync({
        hasNetwork: false,
        socketConnectionState: 'offline',
        socket: null,
      });
      return;
    });
    socket.on('connect', () => {
      log.info('Socket connected');
      this.setStateAsync({
        socketConnectionState: 'connected',
      });
    });

    await this.setStateAsync({
      socket,
      socketConnectionState: 'connecting',
    });
    log.info('Connecting to socket');
    socket.connect();
  }

  render() {
    let Component = this.props.component;
    return <Component {...this.props} {...this.state} />;
  }

}
