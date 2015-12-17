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

const RECONNECT_BACKOFF_BASE_MS = 100;
const RECONNECT_BACKOFF_FUZZ_FACTOR = 0.25;
const RECONNECT_BACKOFF_MAX_MS = 10000;

/**
 * Establish and maintain the connection to the server.
 */
export default class ServerConnectivity extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    component: React.PropTypes.func.isRequired,
  };

  mounted = false;

  reconnectAttempts = 0;
  reconnectTimer = null;

  state = {
    hasNetwork: true,
    socketConnectionState: 'offline',
    socket: null,
  };

  componentWillMount() {
    this.mounted = true;
    this.checkNetworkConnectivity();
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);
  }

  componentWillUnmount() {
    this.mounted = false;
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
    if (this.state.socket) {
      this.state.socket.close();
    }
  }

  onConnectivityChange = (isConnected) => {
    log.info('OS thinks network connectivity is now:', isConnected);
    if (isConnected) {
      this.reconnectAttempts = 0;
    }
    this.checkNetworkConnectivity();
  };

  checkNetworkConnectivity = async () => {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;

    log.info('Checking for network connectivity.');
    let hasNetwork = await this.props.api.canReachServer();
    let { socket } = this.pendingState;
    if (!hasNetwork) {
      log.info(`We can't reach the server, must assume we're offline.`);
      if (socket && socket.connected) {
        socket.close();
      }
      this.setStateAsync({
        hasNetwork: false,
        socketConnectionState: 'offline',
        socket: null,
      });

      // Attempt reconnections anyway.
      this.attemptReconnection();
      return;
    }

    if (socket && socket.connected) {
      log.info('We can reach the server and socket.io is still connected. As you were.');
      return;
    }

    log.info('We can reach the server. Connecting to socket.io.');
    let { api } = this.props;
    socket = new SocketIO(api.socketioClient(socketIOClient, 'account', {
      forceNew: true,
      // Disable socket.io-client's built-in reconnect machinery.
      // We want to be in control of that.
      reconnection: false,
    }));

    await this.setStateAsync({
      hasNetwork: true,
      socketConnectionState: 'connecting',
      socket,
    });

    socket.on('connect_error', this.onSocketDisconnect);
    socket.on('connect_timeout', this.onSocketDisconnect);
    socket.on('disconnect', this.onSocketDisconnect);
    socket.on('connect', () => {
      log.info('Socket connected');
      this.reconnectAttempts = 0;
      this.setStateAsync({
        socketConnectionState: 'connected',
      });
    });
    socket.connect();
  };

  onSocketDisconnect = (event) => {
    log.info('Socket disconnected:', event);
    this.attemptReconnection();
  };

  attemptReconnection() {
    if (this.reconnectTimer) {
      return;
    }

    let backoff = RECONNECT_BACKOFF_BASE_MS * Math.pow(2, this.reconnectAttempts);
    let fuzz = Math.random();
    if ((fuzz * 10) & 1) {
      fuzz = -fuzz;
    }
    backoff += backoff * fuzz * RECONNECT_BACKOFF_FUZZ_FACTOR;
    backoff = Math.min(backoff, RECONNECT_BACKOFF_MAX_MS);
    log.info(`Attempting reconnection in ${backoff} ms`);

    this.reconnectTimer = setTimeout(
      this.checkNetworkConnectivity,
      backoff
    );
    this.reconnectAttempts += 1;
  }

  render() {
    let Component = this.props.component;
    return <Component {...this.props} {...this.state} />;
  }

}
