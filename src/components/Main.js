import React from 'react-native';
let {
  AlertIOS,
  InteractionManager,
  NetInfo,
  View,
  StyleSheet,
} = React;

import socketIOClient from 'socket.io-client-react-native';
import createLog from 'log';
import { Map, OrderedMap, OrderedSet } from 'immutable';

import BLECentral from '../libraries/btle/BLECentral';
import DeviceManager from '../libraries/btle/DeviceManager';
import SocketIO from '../libraries/SocketIO';
import { UserState } from '../libraries/UserState';

import AsyncComponent from './AsyncComponent';
import MonitorsView from './MonitorsView';
import NetworkWarning from './NetworkWarning';
import TopBar from './TopBar';

const log = createLog('Main');

const SOCKET_CONNECT_DEVICE_LIST_TIMEOUT_MS = 1000;
const AFTER_TOUCH_WAIT_MS = 500;

/**
 * This component is the heart of the app.
 *
 * - It monitors network connectivity state.
 * - It connects to socket.io when necessary and maintains the connection state.
 * - It maintains a list of devices known to the app.
 *
 * The actual UI is delegated to various components.
 */
export default class extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.object.isRequired, // TODO: we can do better here
    userState: React.PropTypes.instanceOf(UserState).isRequired,
  };

  state = {
    /**
     * Network state.
     */
    hasNetwork: true,
    connectionState: 'connecting', // purposely optimistic default state
    socketConnectionState: 'offline',
    socketUrl: null,
    socket: null,

    /**
     * Device state.
     *
     * We try to do as little as possible at this high level to avoid
     * unnecessary re-renders.
     */
    // OrderedMap of configured devices that we know about.
    devices: null,

    // OrderedSet of unconfigured peripheral IDs that we observe.
    unconfiguredDevices: new OrderedSet(),

    // Device record of the device that we're configuring right now.
    configuringDevice: null,
  };

  bleDeviceManager = null;
  socket = null;
  mounted = false;

  componentWillMount() {
    this.mounted = true;
    NetInfo.isConnected.fetch().then(this.onConnectivityChange);
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);

    this.bleDeviceManager = new DeviceManager(
      BLECentral,
      this.props.userState
    );
    this.bleDeviceManager.on('stateChange', this.onBLEPeripheralStateChange);
    this.bleDeviceManager.on('disconnect', this.onBLEPeripheralDisconnect);
    this.bleDeviceManager.start();
  }

  componentWillUnmount() {
    this.mounted = false;
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
    if (this.state.socket) {
      this.state.socket.close();
    }

    this.bleDeviceManager.removeAllListeners();
    this.bleDeviceManager.stop();
  }

  // Network and socket.io connectivity

  onConnectivityChange = (hasNetwork) => {
    log.info('Network connectivity change. Can haz internet?', hasNetwork);
    let { socket } = this.pendingState;
    if (!hasNetwork) {
      // Close the socket in case we have one, but don't get rid of it
      // so that the app still remains functional (apart from, you
      // know, not having any network connection).
      if (socket) {
        log.info('Closing old socket');
        socket.off();
        socket.close();
      }
      this.setStateAsync({
        hasNetwork,
        connectionState: 'offline',
        socketConnectionState: 'offline',
      });
      return;
    }
    // We have a network connection (again). Get rid of any old socket
    // that we might have kept around and (re-)connect.
    this.setStateAsync({
      hasNetwork,
      connectionState: 'connecting',
      socketUrl: null,
      socket: null,
    });
    this.connectSocketIO();
    this.fetchDevices();
  };

  connectSocketIO() {
    this.props.api.socketio.address()
      .then(result => this.setSocketUrlAndConnect(result.url))
      .catch(err => {
        log.info('Unable to get server socket.io address', err);
        this.setStateAsync({
          connectionState: 'offline',
        });
      });
  }

  setSocketUrlAndConnect(socketUrl) {
    let { socket } = this.pendingState;
    if (socket) {
      log.info('Closing old socket');
      socket.off();
      socket.close();
    }
    log.info('Going to connect to', socketUrl);
    this.setStateAsync({
      socketUrl,
      socket: null,
      socketConnectionState: 'offline',
    }).then(() => {
      // XXX: Hack to ensure we make the server happy (remove trailing slash).
      if (socketUrl[socketUrl.length - 1] === '/') {
        socketUrl = this.state.socketUrl.slice(0, -1);
      }

      let socket = new SocketIO(socketIOClient(socketUrl, {
        autoConnect: true,
        forceNew: true,
        transports: ['websocket'],
      }));

      this.setStateAsync({
        socket,
        socketConnectionState: socket.connected ? 'connected' : 'connecting',
      });
      if (!socket.connected) {
        log.info('Connecting to ...', socketUrl);
        socket.on('connect', () => {
          log.info(' ... connected');
          this.setStateAsync({
            connectionState: 'connected',
            socketConnectionState: 'connected',
          });
          this.subscribeToVideoStreams();
        });
      }
    });
  }

  subscribeToVideoStreams() {
    let { socket } = this.state;
    if (!socket || !socket.connected) {
      log.error('Trying to subscribe to socket.io room while not connected.');
      return;
    }
    socket.on('video-stream-new', this.onVideoStreamNew);
    socket.on('video-stream-delete', this.onVideoStreamDelete);
    socket.emit('join', 'video-streams');

    if (this.props.userState.isDeveloper) {
      // In the developer account, we get to see all devices connected to
      // the socket.io server. They'll take a few moments to come through,
      // though, so give them some time. If they haven't come through by
      // then, we need to assume there are no devices connected right now.
      setTimeout(() => {
        if (!this.pendingState.devices) {
          this.setState({devices: new OrderedMap()});
        }
      }, SOCKET_CONNECT_DEVICE_LIST_TIMEOUT_MS);
    }
  }

  // Book keeping for configured devices

  async fetchDevices() {
    if (this.props.userState.isDeveloper) {
      return;
    }

    let result;
    try {
      result = await this.props.api.account.listDevices();
    } catch (err) {
      log.info('Could not get device list', err);
      // TODO: halp!
      return;
    }

    let newDevices = new OrderedMap().asMutable();
    let existingDevices = this.pendingState.devices;
    result.devices.forEach((serverObj) => {
      if (!serverObj.deviceId) {
        // https://github.com/silklabs/silk-server/issues/310
        serverObj.deviceId = serverObj.publicKey;
      }
      let { deviceId } = serverObj;
      let clientRecord = existingDevices && existingDevices.get(deviceId);
      let serverRecord = new Map(serverObj); // TODO should we use immutable.Record?

      // No client-side record of this device yet, create it.
      if (!clientRecord) {
        newDevices.set(deviceId, serverRecord);
        return;
      }

      // Client is already up-to-date, use existing client record.
      if (serverRecord.isSubset(clientRecord)) {
        newDevices.set(deviceId, clientRecord);
        return;
      }

      // Stuff changed on the server (e.g. device got renamed), update
      // the client record.
      let newRecord = clientRecord.merge(serverRecord);
      newDevices.set(deviceId, newRecord);
    });

    // Don't cause a re-render if nothing changed.
    if (newDevices.equals(existingDevices)) {
      return;
    }
    this.setStateAsync({devices: newDevices.asImmutable()});
  }

  onVideoStreamNew = async (msg) => {
    if (!this.mounted) {
      return;
    }

    let deviceId = msg.id;
    log.info('new video stream', deviceId);
    let { devices, configuringDevice, unconfiguredDevices } = this.pendingState;
    if (!devices) {
      devices = new OrderedMap();
    }

    if (configuringDevice && configuringDevice.get('deviceId') === deviceId) {
      // We must've successfully configured this new device. Add the
      // device record to the list of configured devices, remove the
      // corresponding entry from the list of unconfigured devices,
      // and reset the configuring device.
      let newRecord = new Map({
        deviceId,
        publicKey: deviceId,
        // Explicitly use the name we gave it locally.
        name: configuringDevice.get('name'),
        logo: msg.logo,
        previewSize: msg.previewSize,
      });
      this.setStateAsync({
        // TODO: perhaps we should add the new record to the beginning
        // of the ordered map? Need to figure out how to preserve
        // device order in general. Perhaps simply take what server
        // serves in reverse (most recently configured devices always
        // further towards the top).
        devices: devices.set(deviceId, newRecord),
        unconfiguredDevices: unconfiguredDevices.delete(configuringDevice.get('peripheralId')),
        configuringDevice: null,
      });
      return;
    }

    let deviceRecord = devices.get(deviceId);
    if (!deviceRecord) {
      if (!this.props.userState.isDeveloper) {
        // Not a device we know about, and we're not a developer, so bail.
        return;
      }
      // A device we don't know about, but it's ok, we're a developer.
      // So just create a record for it.
      let newRecord = new Map({
        deviceId,
        publicKey: deviceId,
        name: msg.name,
        logo: msg.logo,
        previewSize: msg.previewSize,
      });
      this.setStateAsync({devices: devices.set(deviceId, newRecord)});
      return;
    }

    // Existing record from the server. Supplement it with info from device.
    if (!deviceRecord.has('previewSize')) {
      devices = devices.setIn([deviceId, 'previewSize'], msg.previewSize);
    }
    if (!deviceRecord.has('logo')) {
      devices = devices.setIn([deviceId, 'logo'], msg.logo);
    }
    if (devices !== this.pendingState.devices) {
      this.setStateAsync({devices});
    }
  };

  onVideoStreamDelete = (msg) => {
    if (!this.mounted) {
      return;
    }

    if (this.props.userState.isDeveloper) {
      log.info('deleted video stream', msg.id);
      this.setStateAsync({devices: this.pendingState.devices.delete(msg.id)});
    }

    // TODO: should we update any state here? Perhaps that the device went
    // offline, so that the user can check power and WiFi connectivity for it?
    // See https://github.com/silklabs/silk-app/issues/526
  };

  // Book keeping for unconfigured devices detected via BLE

  onBLEPeripheralStateChange = (peripheral) => {
    let { unconfiguredDevices } = this.pendingState;
    let { state, id } = peripheral;

    if (state === 'registered' && unconfiguredDevices.contains(id)) {
      log.info('BLE peripheral now registered', peripheral.id);
      this.setStateAsync({
        unconfiguredDevices: unconfiguredDevices.delete(peripheral.id),
      });
      return;
    }

    if (state === 'unregistered' && !unconfiguredDevices.contains(id)) {
      log.info('Detected new unregistered device', id);
      this.setStateAsync({
        unconfiguredDevices: unconfiguredDevices.add(peripheral.id),
      });
      return;
    }
  };

  onBLEPeripheralDisconnect = (peripheral) => {
    let { unconfiguredDevices } = this.pendingState;
    if (unconfiguredDevices.contains(peripheral.id)) {
      log.info('BLE peripheral disconnected', peripheral.id);
      this.setStateAsync({
        unconfiguredDevices: unconfiguredDevices.delete(peripheral.id),
      });
    }
  };

  configureDevice = (peripheralId) => {
    let deviceTouchView = null;
    this.props.navigator.push({
      name: 'DeviceTouch',
      props: {
        peripheralId,
        bleDeviceManager: this.bleDeviceManager,
        onCancel: () => this.props.navigator.popToTop(),
        // Keep a ref so that we can update the view when the devices touch.
        ref: (element) => deviceTouchView = element,
      },
    });

    InteractionManager.runAfterInteractions(() => {
      this.setStateAsync({
        configuringDevice: new Map({
          deviceId: null,
          name: null,
          peripheralId,
        }),
      });
    });

    let canceled = false;
    let onDeviceTouch = (peripheral) => {
      return new Promise((resolve, reject) => {
        if (!deviceTouchView) {
          reject(new Error('Did not render the setup flow?'));
          return;
        }
        // Alright, we have achieved touch! Update the touch UI
        // briefly to let the user know they did it correctly.
        deviceTouchView.onDeviceTouch();
        deviceTouchView = null;

        // After a brief period of time, advance to the configuration
        // screen where the user can enter device name, wifi
        // credentials, etc.
        setTimeout(() => this.props.navigator.push({
          name: 'DeviceConfig',
          props: {
            onCancel: () => {
              canceled = true;
              reject(new Error('User canceled.'));
              // We'll pop the views off the navigation stack below.
            },
            onSave: (config) => {
              this.props.navigator.popToTop();

              // The UI needs to be responsive immediately, so pop the setup
              // screens first.  For the following book keeping ensure we
              // don't interfere with the navigation animation.
              InteractionManager.runAfterInteractions(() => {
                // Update the name of the new device in the UI.
                let { configuringDevice } = this.pendingState;
                configuringDevice = configuringDevice
                  .set('name', config.name)
                  .set('deviceId', peripheral.deviceId);
                this.setStateAsync({configuringDevice});

                // And finally, configure the device.
                resolve(config);
              });
            },
          },
        }), AFTER_TOUCH_WAIT_MS);
      });
    };

    return this.bleDeviceManager
      .configureDevice(peripheralId, onDeviceTouch)
      .catch((err) => {
        log.info('Could not configure device', err);
        this.props.navigator.popToTop();

        InteractionManager.runAfterInteractions(() => {
          this.setStateAsync({configuringDevice: null});
          if (!canceled) {
            this._showConfigError();
          }
        });
      });
  };

  _showConfigError() {
    AlertIOS.alert(
      'Error Configuring Device',
      'The device could not be configured. Ensure that it is turned on and nearby.'
    );
  }

  unregisterDevice = async (deviceId) => {
    let { devices } = this.state;
    if (!devices) {
      log.error('No known devices. Cannot unregister device.', deviceId);
      throw new Error('No known devices. Cannot unregister device.', deviceId);
    }

    let deviceRecord = devices.get(deviceId);
    if (!deviceRecord) {
      log.error('Unknown device, cannot unregister.', deviceId);
      throw new Error('Unknown device, cannot unregister.', deviceId);
    }

    let devicePublicKey = deviceRecord.get('publicKey');
    log.info('Attempting to unregister device from server.', deviceId);
    let result = await this.props.api.account.unregisterDevice({devicePublicKey});
    if (!result || !result.success) {
      throw new Error('Attempt to unregister device was unsuccessful', deviceId);
    }

    await this.setStateAsync({devices: this.pendingState.devices.delete(deviceId)});
  };

  static childContextTypes = {
    // TODO could be more specific here.
    silkDevices: React.PropTypes.object.isRequired,
  };

  childContext = {
    silkDevices: {
      configureDevice: this.configureDevice,
      unregisterDevice: this.unregisterDevice,
      // TODO: instead of passing down `bleDeviceManager`, we should
      // expose minimal functionality like RSSI change subscriptions
      // etc. here
      // TODO: expose fullscreen video here
    },
  };

  getChildContext() {
    return this.childContext;
  }

  render() {
    return (
      <View style={styles.container}>
        <TopBar
          socketConnectionState={this.state.socketConnectionState}
          {...this.props}
        />
        <NetworkWarning />
        <MonitorsView
          bleDeviceManager={this.bleDeviceManager}
          {...this.state}
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
