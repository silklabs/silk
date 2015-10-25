/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';

import DeviceManager from '../libraries/btle/DeviceManager';
import PreviewQueue from '../libraries/PreviewQueue';

import ImageView from './ImageView';
import ObjectBoxes from './ObjectBoxes';
import SocketIOComponent from './SocketIOComponent';

let {
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

const DEVICE_PREVIEW_TIMEOUT_MS = 5000;
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
    configurable: React.PropTypes.bool,
    configuring: React.PropTypes.bool,
    onPress: React.PropTypes.func,

    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.object.isRequired,
    bleDeviceManager: React.PropTypes.instanceOf(DeviceManager).isRequired,
  };

  static contextTypes = {
    silkDevices: React.PropTypes.object.isRequired,
  };

  state = {
    blob: null,
    objects: [],
    previewWidth: null,
    serverConnectionStatus: null, // see CONNECTION_STATUS_LABELS
    timedOut: false,
  };

  _timeoutTimer = null;

  componentWillMount() {
    this._queue = new PreviewQueue(this.props.label, message => {
      this.setState({
        timedOut: false,
        blob: message.frame,
        objects: message.objects || [],
      });
    });

    this.subscribeToSocket(this.props.socket);
    if (this.props.configuring) {
      this.subscribeToBLEStatus();
    }
    this.startTimeoutTimer();
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.configuring && nextProps.configuring) {
      this.subscribeToBLEStatus();
    }
    if (!this.props.hasNetwork && nextProps.hasNetwork) {
      this.startTimeoutTimer();
    }
    if (this.props.hasNetwork && !nextProps.hasNetwork) {
      this.clearTimeoutTimer();
    }
  }

  subscribeToSocket(socket) {
    let { deviceId, configurable } = this.props;
    if (configurable || !socket || !deviceId) {
      return;
    }
    let stream = `preview-${deviceId}`;
    socket.on(stream, this.onPreviewFrame);
    socket.join(stream);
  }

  unsubscribeFromSocket(socket) {
    let { deviceId } = this.props;
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
        this.setState({timedOut: true, blob: null});
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
    let { socket, bleDeviceManager } = this.props;
    this.unsubscribeFromSocket(socket);
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
    bleDeviceManager.removeListener('statusChange', this.onBLEPeripheralStatusChange);
    bleDeviceManager.removeListener('errorChange', this.onBLEPeripheralStatusChange);
    this.clearTimeoutTimer();
  }

  subscribeToBLEStatus() {
    this.props.bleDeviceManager.on('statusChange', this.onBLEPeripheralStatusChange);
    this.props.bleDeviceManager.on('errorChange', this.onBLEPeripheralStatusChange);
  }

  onBLEPeripheralStatusChange = (peripheral) => {
    if (this.props.peripheralId !== peripheral.id) {
      return;
    }
    this.startTimeoutTimer();
    let serverConnectionStatus =
      peripheral.error ? peripheral.error : peripheral.serverConnectionStatus;
    if (!this.state.serverConnectionStatus !== serverConnectionStatus) {
      this.setState({serverConnectionStatus});
    }
  };

  _renderLabel() {
    let { label } = this.props;
    let { serverConnectionStatus } = this.state;
    if (serverConnectionStatus) {
      let statusLabel = CONNECTION_STATUS_LABELS[serverConnectionStatus] || serverConnectionStatus;
      label = `${label} (${statusLabel})`;
    }
    return (
      <View style={styles.monitorLabelContainer}>
        <Text style={styles.monitorLabel}>{label}</Text>
      </View>
    );
  }

  _renderPreview() {
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
    let { previewWidth } = this.state;
    if (previewWidth === null) {
      // Measure layout so we know how large to display the preview images.
      return (
        <View style={styles.monitorContainer}>
          <View
            onLayout={(event) => this.setState({previewWidth: event.nativeEvent.layout.width})}
            style={styles.monitorPreviewPlaceholder}
          />
        </View>
      );
    }

    let { previewSize } = this.props;
    let previewStyle = {
      width: previewWidth,
      height: previewSize.height * previewWidth / previewSize.width,
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
      <View style={styles.monitorContainer}>
        <TouchableOpacity
          onPress={this._onPress}
          style={[styles.monitorPreviewContainer, previewStyle]}>
          {this._renderPreview()}
          {logo}
          {this._renderLabel()}
          {objects}
        </TouchableOpacity>
      </View>
    );
  }

  _onPress = () => {
    if (this.props.configurable) {
      this.context.silkDevices.configureDevice(this.props.peripheralId);
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
    margin: 4,
    flex: 1,
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

  monitorPreviewPlaceholder: {
    flex: 1,
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
