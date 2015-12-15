import React from 'react-native';
import { OrderedMap, OrderedSet, Record } from 'immutable';
import createLog from 'log';
import { SilkApi } from 'silk-api';

import getDeviceManager from '../../libraries/ble/DeviceManager';
import SocketIO from '../../libraries/SocketIO';
import { UserState } from '../../libraries/UserState';

import AsyncComponent from './AsyncComponent';

const log = createLog('Devices');
const {
  AlertIOS,
  InteractionManager,
  NativeModules,
} = React;
const { BLESocketManager } = NativeModules;


export const DeviceRecord = Record({ /* eslint new-cap: 0 */
  deviceId: null,
  publicKey: null,
  name: null,
  logo: null,
  previewSize: null,
  haveVideoStream: false,
  bleDeviceSession: null,
});

export const ConfiguringDeviceRecord = Record({ /* eslint new-cap: 0 */
  deviceId: null,
  name: null,
  bleDeviceSession: null,
});

// Obsolete once https://github.com/facebook/react-native/pull/3788
// gets upstreamed.
function uiInteractions() {
  return new Promise((resolve) => InteractionManager.runAfterInteractions(resolve));
}

/**
 * Maintain a list of devices known to the app.
 */
export default class Devices extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    userState: React.PropTypes.instanceOf(UserState).isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),
    component: React.PropTypes.func.isRequired,
  };

  /**
   * This is the app's high level state of devices in the current
   * account. We try to do as little as possible at this high level to
   * avoid unnecessary re-renders.
   */
  state = {
    // OrderedMap of configured devices that we know about.
    devices: null,

    // OrderedSet of DeviceSession objects rerpresenting BLE sockets
    // to unconfigured devices.
    unconfiguredDevices: new OrderedSet(),

    // Device record of the device that we're configuring right now.
    configuringDevice: null,
  };

  bleDeviceManager = null;
  mounted = false;
  _fetchDevicesPromise = Promise.resolve();

  componentWillMount() {
    log.info('PROPS', Object.keys(this.props));
    this.mounted = true;
    this.bleDeviceManager = getDeviceManager(this.props.userState);
    this.bleDeviceManager.on('connect', this.onBLEDeviceConnect);
    BLESocketManager.start();

    if (this.props.hasNetwork) {
      this._fetchDevicesPromise = this.fetchDevices();
    }

    let { socket } = this.props;
    if (socket) {
      this.subscribeToDevices(socket);
    }
  }

  componentWillUnmount() {
    this.mounted = false;

    BLESocketManager.stop();
    this.bleDeviceManager.removeAllListeners();

    let { unconfiguredDevices, configuringDevice } = this.state;
    unconfiguredDevices.forEach(device => device.removeAllListeners());
    if (configuringDevice && configuringDevice.bleDeviceSession) {
      configuringDevice.bleDeviceSession.removeAllListeners();
    }
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.socket !== nextProps.socket && nextProps.socket) {
      this.subscribeToDevices(nextProps.socket);
    }

    if (!this.props.hasNetwork && nextProps.hasNetwork) {
      this._fetchDevicesPromise = this.fetchDevices();
    }
  }

  // Book keeping for configured devices

  subscribeToDevices(socket) {
    socket.on('connect', () => {
      // Be sure we have our device list before we subscribe to the
      // video streams, otherwise we might identify any video
      // streams coming in before we know the device list as not
      // pertaining to our account.
      // See also https://github.com/silklabs/silk-app/issues/566.
      this._fetchDevicesPromise.then(() => {
        this._fetchDevicesPromise = Promise.resolve();

        if (socket.connected) {
          socket.on('video-stream-new', this.onVideoStreamNew);
          socket.on('video-stream-delete', this.onVideoStreamDelete);
          socket.emit('join', 'video-streams');
        }
      });
    });
  }

  async fetchDevices() {
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
      let serverRecord = new DeviceRecord(serverObj);

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

    let immutableDevices = newDevices.asImmutable();
    this.setStateAsync({devices: immutableDevices});
    await this.props.userState.updateRegisteredDevices(immutableDevices.toArray());
  }

  onVideoStreamNew = (msg) => {
    if (!this.mounted) {
      return;
    }

    let deviceId = msg.id;
    log.info('New video stream', msg.name, deviceId);
    log.debug('Full device message', msg);
    let { devices, configuringDevice, unconfiguredDevices } = this.pendingState;
    if (!devices) {
      devices = new OrderedMap();
    }

    if (configuringDevice && configuringDevice.deviceId === deviceId) {
      // We must've successfully configured this new device. Let's
      // close the loop on the BLE socket.
      log.debug('New video stream belongs to currently configuring device.');
      configuringDevice.bleDeviceSession.dismiss();

      // Add the device record to the list of configured devices,
      // remove the corresponding entry from the list of unconfigured
      // devices, and reset the configuring device.
      let newRecord = new DeviceRecord({
        deviceId,
        publicKey: deviceId,
        // Explicitly use the name we gave it locally.
        name: configuringDevice.name,
        logo: msg.logo,
        previewSize: msg.previewSize,
        haveVideoStream: true,
        bleDeviceSession: configuringDevice.bleDeviceSession,
      });
      devices = devices.delete(deviceId).set(deviceId, newRecord);
      this.setStateAsync({
        // There could be a lingering record of the device already.
        // "But how can this be, we just configured the device!",
        // you might ask. Well, if we configured the device because it
        // merely lost WiFi credentials, then it retained its deviceId.
        // In this case we just want to bump it to the right place, so we
        // explicitly remove it from the ordered map before re-adding it.
        devices,
        unconfiguredDevices: unconfiguredDevices.delete(configuringDevice.bleDeviceSession),
        configuringDevice: null,
      });
      this.props.userState.updateRegisteredDevices(devices.toArray());
      return;
    }

    let deviceRecord = devices.get(deviceId);
    if (!deviceRecord) {
      // Not a device we know about, bail.
      return;
    }

    // Existing record from the server. Supplement it with info from device.
    devices = devices.setIn([deviceId, 'haveVideoStream'], true);
    if (!deviceRecord.previewSize) {
      devices = devices.setIn([deviceId, 'previewSize'], msg.previewSize);
    }
    if (!deviceRecord.logo) {
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

    let { devices } = this.pendingState;
    let deviceId = msg.id;
    if (!devices.has(deviceId)) {
      return;
    }
    log.info('Deleting video stream', deviceId);
    this.setStateAsync({
      devices: devices.setIn([deviceId, 'haveVideoStream'], false),
    });
  };

  // Book keeping for unconfigured devices detected via BLE

  onBLEDeviceConnect = (bleDeviceSession) => {
    log.debug(`New BLE socket connection to ${bleDeviceSession.manufacturer} ${bleDeviceSession.model}`);

    if (!bleDeviceSession.isRegistered) {
      log.debug(`Device on BLE socket is not registered`);
      let { unconfiguredDevices } = this.pendingState;
      if (unconfiguredDevices.contains(bleDeviceSession)) {
        log.debug(`We're already tracking this BLE device... Huh?`);
        return;
      }
      this.setStateAsync({
        unconfiguredDevices: unconfiguredDevices.add(bleDeviceSession),
      });
    }

    bleDeviceSession.on('registered', () => {
      log.debug(`Device on BLE socket is registered: ${bleDeviceSession.deviceId}`);

      // Is it because we are actually in the process of registering the device?
      let { configuringDevice } = this.pendingState;
      let isCurrentConfiguringDevice = configuringDevice &&
        configuringDevice.bleDeviceSession === bleDeviceSession;
      if (isCurrentConfiguringDevice) {
        log.debug(`We're currently configuring it. Avoid changing state just yet.`);
        return;
      }

      // It's a previously unconfigured device, but we weren't
      // configuring it? That shouldn't happen...
      let { unconfiguredDevices } = this.pendingState;
      if (unconfiguredDevices.contains(bleDeviceSession)) {
        log.warn(`Found unconfigured device that magically became configured. Wat?`);
        this.setStateAsync({
          unconfiguredDevices: unconfiguredDevices.delete(bleDeviceSession),
        });
        return;
      }

      let { devices } = this.pendingState;
      if (!devices) {
        // This means we haven't fetched devices from the network yet.
        devices = new OrderedMap();
      }
      let { deviceId } = bleDeviceSession;
      let record = devices.get(deviceId);
      if (record) {
        log.debug(`Mapping BLE socket to existing device record: ${deviceId}`);
        devices = devices.setIn([deviceId, 'bleDeviceSession'], bleDeviceSession);
      } else {
        // Either this means we haven't fetched devices from the network
        // yet (see above), or we've encountered a device not registered
        // with the account. This shouldn't really happen, but we have
        // the sketchy developer account, so allow it for now.
        record = new DeviceRecord({
          deviceId,
          publicKey: deviceId,
          // TODO: have the device sent its name along if it's registered
          name: 'Silk Device',
          bleDeviceSession,
        });
        devices = devices.set(deviceId, record);
      }
      this.setStateAsync({devices});
    });

    bleDeviceSession.on('disconnect', () => {
      log.debug('BLE socket disconnected. Cleaning up.');
      bleDeviceSession.removeAllListeners();

      let { devices, configuringDevice, unconfiguredDevices } = this.pendingState;

      let { deviceId } = bleDeviceSession;
      if (deviceId && devices.get(bleDeviceSession.deviceId)) {
        log.debug(`The disconnected BLE socket belonged to device ID ${deviceId}`);
        devices = devices.setIn([deviceId, 'bleDeviceSession'], null);
      }

      let isCurrentConfiguringDevice = configuringDevice &&
        configuringDevice.bleDeviceSession === bleDeviceSession;

      if (unconfiguredDevices.contains(bleDeviceSession)) {
        log.debug(`The disconnected BLE device belonged to an unconfigured device.`);
        unconfiguredDevices = unconfiguredDevices.delete(bleDeviceSession);
      }

      if (devices !== this.pendingState.devices ||
          isCurrentConfiguringDevice ||
          unconfiguredDevices !== this.pendingState.unconfiguredDevices) {
        this.setStateAsync({
          devices,
          configuringDevice: null,
          unconfiguredDevices,
        });
      }

      if (isCurrentConfiguringDevice) {
        this._abortConfig(bleDeviceSession, new Error('BLE socket disconnected.'));
      }
    });
  };

  configureDevice = async (bleDeviceSession) => {
    log.debug('Going to configure a device.');
    try {
      bleDeviceSession.acceptRegistrationRequest();
      bleDeviceSession.once('secret', (deviceSecret) => {
        let { deviceId } = deviceSecret;
        log.debug('And now kiththth! Received device ID', deviceId);
        let configuringDevice = new ConfiguringDeviceRecord({
          bleDeviceSession,
          deviceId,
          name: null,
        });
        this.setStateAsync({configuringDevice});
      });

      log.debug('Launching device setup UI.');
      let config = await new Promise((resolve, reject) => {
        this.props.navigator.pushAsync({
          name: 'DeviceTouch',
          props: {
            bleDeviceSession,
            onCancel: () => reject({canceled: true}),
            onSave: resolve,
          },
        });
      });
      log.debug('Device setup UI complete, received configuration', config);
      this.props.navigator.popToTop();

      // Update the name of the new device in the UI after the
      // previous navigation animation has finished.
      await uiInteractions();
      let { configuringDevice } = this.pendingState;
      configuringDevice = configuringDevice.set('name', config.name);
      this.setStateAsync({configuringDevice});

      log.debug('Going to register the device with the server.');
      let {
        success,
        registrarPublicKey,
        registrationToken,
      } = await this.props.userState.registerDevice(
        config.name,
        config.deviceId
      );
      if (!success) {
        throw new Error('Could not register device with the server.');
      }

      // And finally, configure the device.
      log.debug('Successfully registered with server. ' +
                'Sending registration information to device.');
      bleDeviceSession.sendRegistrationInformation({
        accessPoint: config.ssid,
        password: config.secret,
        publicKey: registrarPublicKey,
        regToken: registrationToken,
        serverUrl: this.props.api.config.serverUrl,
      });
    } catch(ex) {
      await this._abortConfig(bleDeviceSession, ex);
    }
  };

  async _abortConfig(bleDeviceSession, error) {
    await this.props.navigator.popToTopAsync();
    await uiInteractions();

    // Attempt to reset the BLE socket connection to the device so we
    // can make another attempt at configuring the device. This should
    // be possible if the user canceled or the device registration
    // failed due to lack of network connectivity to the server.
    try {
      bleDeviceSession.restart();
    } catch (ex) { // eslint-disable-line no-empty
      // Ignore. The BLE socket connection is toast and can't be salvaged.
      // We'll just have to wait for it to be re-established.
    }

    if (this.pendingState.configuringDevice) {
      await this.setStateAsync({configuringDevice: null});
    }
    if (error && error.canceled) {
      log.debug('User cancelled. Aborting.');
    } else {
      log.warn('Could not configure device due to error:', error);
      this._showConfigError();
    }
  }

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

    let devicePublicKey = deviceRecord.publicKey;
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
    let Component = this.props.component;
    return <Component {...this.props} {...this.state} />;
  }

}
