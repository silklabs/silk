import React from 'react-native';

import { DeviceSession } from '../libraries/ble/DeviceManager';
import PreviewQueue from '../libraries/PreviewQueue';
import SocketIO from '../libraries/SocketIO';

import ImageView from './ImageView';
import ObjectBoxes from './ObjectBoxes';
import SocketIOComponent from './abstract/SocketIOComponent';
import { ThumbnailStyles, THUMBNAIL_MARGIN } from './CommonStyles';

const {
  ActionSheetIOS,
  ActivityIndicatorIOS,
  AlertIOS,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

const CONNECTION_STATUS_LABELS = {
  'server_disconnected': 'server disconnected',
  'server_connecting': 'connecting to server',
  'server_connected': 'connected to server',
  'wifi_offline': 'not connected to WiFi',
  'wifi_disconnected': 'not connected to WiFi',
  'wifi_scanning': 'scanning for WiFi networks',
  'wifi_associating': 'connecting to WiFI',
  'wifi_associated': 'connecting to WiFi',
  'wifi_authenticating': 'authenticating with WiFi',
  'wifi_connected': 'connected to WiFi',
  'wifi_dhcping': 'configuring WiFi',
  'wifi_online': 'connected to WiFi',
};

const DEVICE_RECONNECT_PREVIEW_DELAY_MS = 1000;
const DEVICE_PREVIEW_TIMEOUT_MS = 10000;
const DEVICE_CONFIGURING_TIMEOUT_MS = 60000;

export default class extends SocketIOComponent {
  static propTypes = {
    deviceId: React.PropTypes.string,
    peripheralId: React.PropTypes.string,
    label: React.PropTypes.string.isRequired,
    logo: React.PropTypes.object,
    previewSize: React.PropTypes.shape({
      width: React.PropTypes.number.isRequired,
      height: React.PropTypes.number.isRequired,
    }),
    width: React.PropTypes.number.isRequired,
    configurable: React.PropTypes.bool,
    configuring: React.PropTypes.bool,
    haveVideoStream: React.PropTypes.bool,
    onPress: React.PropTypes.func,

    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession),
  };

  static contextTypes = {
    silkDevices: React.PropTypes.object.isRequired,
  };

  state = {
    blob: null,
    objects: [],
    registered: false,
    serverConnectionStatus: null, // see CONNECTION_STATUS_LABELS
    timedOut: false,
  };

  mounted: false;
  _timeoutTimer = null;

  componentWillMount() {
    this.mounted = true;
    this._queue = new PreviewQueue(this.props.label, message => {
      this.setState({
        timedOut: false,
        blob: message.frame,
        objects: message.objects || [],
      });
    });

    if (this.props.haveVideoStream) {
      this.subscribeToSocket();
    }
    if (this.props.bleDeviceSession) {
      this.subscribeToBLEStatus(this.props.bleDeviceSession);
    }
    this.startTimeoutTimer();
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.haveVideoStream && nextProps.haveVideoStream) {
      // The device was known to us before, but only just now came
      // online. Start subscribing to the device's socket.io room to
      // receive preview images. However, for some reason, subscribing
      // to it immediately can lead to not receiving any messages at all.
      // See https://github.com/silklabs/silk-app/issues/577.
      // Also, in anticipation of receiving preview images soon, clear any
      // timeout state.
      this.unsubscribeFromSocket();
      this.startTimeoutTimer();
      this.setState({timedOut: false, blob: null, objects: []});
      setTimeout(() => {
        this.subscribeToSocket();
      }, DEVICE_RECONNECT_PREVIEW_DELAY_MS);
    }
    if (!this.props.bleDeviceSession && nextProps.bleDeviceSession) {
      this.subscribeToBLEStatus(nextProps.bleDeviceSession);
    }
    if (this.props.bleDeviceSession && !nextProps.bleDeviceSession) {
      // There's no need to explicitly unsubscribe from `bleDeviceSession`
      // here. If we lose the session, it means it disconnected, which
      // causes us to remove all listeners anyway. But now that we no longer
      // are talking to the device, we don't know what its status is, so
      // let's reset that.
      this.setState({serverConnectionStatus: null});
    }
    if (!this.props.hasNetwork && nextProps.hasNetwork) {
      this.startTimeoutTimer();
    }
    if (this.props.hasNetwork && !nextProps.hasNetwork) {
      this.clearTimeoutTimer();
    }
  }

  subscribeToSocket() {
    let { socket, deviceId } = this.props;
    if (!socket || !deviceId || !this.mounted) {
      return;
    }
    let stream = `preview-${deviceId}`;
    socket.on(stream, this.onPreviewFrame);
    socket.join(stream);
  }

  unsubscribeFromSocket() {
    let { socket, deviceId } = this.props;
    if (!socket || !deviceId) {
      return;
    }
    let stream = `preview-${deviceId}`;
    socket.off(stream, this.onPreviewFrame);
    socket.leave(stream);
  }

  startTimeoutTimer() {
    if (this.props.configurable) {
      return;
    }
    if (this.props.configuring && !this.state.registered) {
      return;
    }
    this.clearTimeoutTimer();
    let timeOut = DEVICE_PREVIEW_TIMEOUT_MS;
    if (this.props.configuring) {
      timeOut = DEVICE_CONFIGURING_TIMEOUT_MS;
    }
    this._timeoutTimer = setTimeout(
      () => {
        if (!this.props.hasNetwork) {
          return;
        }
        this.setState({timedOut: true, blob: null, objects: []});
      },
      timeOut
    );
  }

  clearTimeoutTimer() {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
    }
  }

  onPreviewFrame = (message) => {
    this._queue.push(message);
    this.startTimeoutTimer();
  };

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeFromSocket();
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
    let { bleDeviceSession } = this.props;
    if (bleDeviceSession) {
      bleDeviceSession.removeListener('status', this.onBLEDeviceStatusChange);
      bleDeviceSession.removeListener('registered', this.onBLEDeviceRegistered);
    }
    this.clearTimeoutTimer();
  }

  subscribeToBLEStatus(bleDeviceSession) {
    bleDeviceSession.on('registered', this.onBLEDeviceRegistered);
    bleDeviceSession.on('status', this.onBLEDeviceStatusChange);
  }

  onBLEDeviceStatusChange = (status) => {
    this.startTimeoutTimer();
    if (!this.state.serverConnectionStatus !== status.message) {
      this.setState({serverConnectionStatus: status.message});
    }
  };

  onBLEDeviceRegistered = () => {
    this.startTimeoutTimer();
    this.setState({registered: true});
  };

  _renderLabel() {
    let { label, bleDeviceSession } = this.props;
    let { serverConnectionStatus } = this.state;
    if (serverConnectionStatus) {
      let statusLabel = CONNECTION_STATUS_LABELS[serverConnectionStatus] || serverConnectionStatus;
      label = `${label} (${statusLabel})`;
    } else if (bleDeviceSession) {
      label = `${label} (BLE)`;
    }
    return (
      <View style={styles.monitorLabelContainer}>
        <Text style={styles.monitorLabel}>{label}</Text>
      </View>
    );
  }

  _renderPreview() {
    // TODO: display this.props.haveVideoStream visually in some way.
    // See https://github.com/silklabs/silk-app/issues/526
    if (this.state.blob) {
      return <ImageView style={styles.preview} blob={this.state.blob} />;
    }
    if (this.props.configurable) {
      return (
        <Text style={styles.newDevicePlus}>+</Text>
      );
    }
    if (this.state.timedOut) {
      return (
        <Text style={styles.timedOutLabel}>
          No preview available. Device appears to be offline.
        </Text>
      );
    }
    return <ActivityIndicatorIOS color="white" />;
  }

  render() {
    let { width, previewSize } = this.props;
    width -= 2 * THUMBNAIL_MARGIN;
    let previewStyle = {
      width,
      height: previewSize.height * width / previewSize.width,
    };

    let logo = null;
    if (this.props.logo) {
      logo = (
        <ImageView
          style={styles.logo}
          blob={this.props.logo}
        />
      );
    }

    let objects = null;
    if (this.state.objects.length) {
      objects = (
        <ObjectBoxes
          deviceId={this.props.deviceId}
          socket={this.props.socket}
          width={previewStyle.width}
          height={previewStyle.height}
          objects={this.state.objects}
          previewSize={previewSize}
          style={styles.preview}
        />
      );
    }

    return (
      <View style={[
        styles.monitorContainer,
        ThumbnailStyles.thumbnailContainer,
        previewStyle,
      ]}>
        <TouchableOpacity
          onPress={this._onPress}
          style={styles.monitorPreviewContainer}>
          {this._renderPreview()}
          {logo}
          {this._renderLabel()}
          {objects}
        </TouchableOpacity>
      </View>
    );
  }

  _onPress = () => {
    if (this.props.configuring) {
      return;
    }
    if (this.props.configurable) {
      this.context.silkDevices.configureDevice(this.props.bleDeviceSession);
      return;
    }
    if (this.state.timedOut && this.props.deviceId) {
      this._showRemoveDeviceSheet();
      return;
    }
    this.props.onPress();
  };

  _showRemoveDeviceSheet = () => {
    ActionSheetIOS.showActionSheetWithOptions({
      options: [
        'Remove Device',
        'Cancel',
      ],
      cancelButtonIndex: 1,
      destructiveButtonIndex: 0,
    }, async (buttonIndex) => {
      if (buttonIndex === 1) {
        return;
      }
      // Display spinner again while we're attempting to unregister the device.
      await this.setStateAsync({timedOut: false});

      try {
        await this.context.silkDevices.unregisterDevice(this.props.deviceId);
      } catch(ex) {
        AlertIOS.alert(
          'Error Unregistering Device',
          'The device could not be unregistered. Please try again.'
        );
        // Restore timeout error message again.
        await this.setStateAsync({timedOut: true});
      }
    });
  };
}

const styles = StyleSheet.create({
  monitorContainer: {
    shadowColor: 'black',
    shadowRadius: 2,
    shadowOpacity: 0.5,
    shadowOffset: {
      height: 1,
      width: 0,
    },
  },

  monitorLabelContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'black',
    opacity: 0.5,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  monitorLabel: {
    fontFamily: 'Open Sans',
    fontSize: 10,
    color: 'white',
    textAlign: 'right',
  },

  monitorPreviewContainer: {
    backgroundColor: '#99a0a4',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  preview: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'transparent',
  },

  newDevicePlus: {
    color: 'white',
    fontSize: 72,
    backgroundColor: 'transparent',
  },

  placeholderPreview: {
    flex: 1,
    backgroundColor: 'gray',
  },

  logo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 15,
    opacity: 0.5,
  },

  timedOutLabel: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
    padding: 8,
  },
});
