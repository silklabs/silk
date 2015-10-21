/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';

import DeviceManager from '../libraries/btle/DeviceManager';
import PreviewQueue from '../libraries/PreviewQueue';

import ImageView from './ImageView';
import ObjectBoxes from './ObjectBoxes';
import SocketIOComponent from './SocketIOComponent';

let {
  ActivityIndicatorIOS,
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
    socket: React.PropTypes.object.isRequired,
    bleDeviceManager: React.PropTypes.instanceOf(DeviceManager).isRequired,
  };

  state = {
    objects: [],
    previewWidth: null,
    serverConnectionStatus: null, // see CONNECTION_STATUS_LABELS
  };

  componentWillMount() {
    this._queue = new PreviewQueue(this.props.label, message => {
      this.setState({
        blob: message.frame,
        objects: message.objects || [],
      });
    });

    this.subscribeToSocket(this.props.socket);
    if (this.props.configuring) {
      this.subscribeToBLEStatus();
    }
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.configuring && nextProps.configuring) {
      this.subscribeToBLEStatus();
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

  onPreviewFrame = (message) => {
    this._queue.push(message);
  };

  componentWillUnmount() {
    let { socket, bleDeviceManager } = this.props;
    this.unsubscribeFromSocket(socket);
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
    bleDeviceManager.removeListener('statusChange', this.onBLEPeripheralStatusChange);
  }

  subscribeToBLEStatus() {
    this.props.bleDeviceManager.on('statusChange', this.onBLEPeripheralStatusChange);
  }

  onBLEPeripheralStatusChange = (peripheral) => {
    if (this.props.peripheralId !== peripheral.id) {
      return;
    }
    let serverConnectionStatus =
      peripheral.error ? peripheral.error : peripheral.serverConnectionStatus;
    if (!this.state.serverConnectionStatus !== serverConnectionStatus) {
      this.setState({serverConnectionStatus});
    }
  };

  render() {
    let { label } = this.props;
    let { serverConnectionStatus } = this.state;
    if (serverConnectionStatus) {
      let statusLabel = CONNECTION_STATUS_LABELS[serverConnectionStatus] || serverConnectionStatus;
      label = `${label} (${statusLabel})`;
    }
    return (
      <View style={styles.monitorContainer}>
        <View style={styles.monitorLabelContainer}>
          <Text style={styles.monitorLabel}>{label}</Text>
        </View>
        {this._renderPreview()}
      </View>
    );
  }

  _renderPreview() {
    if (this.state.previewWidth === null) {
      // Measure layout so we know how large to display the preview images.
      return (
        <View
          onLayout={(event) => this.setState({previewWidth: event.nativeEvent.layout.width})}
          style={styles.monitorPreviewPlaceholder}
        />
      );
    }

    let { previewSize } = this.props;
    let previewStyle = {
      width: this.state.previewWidth,
      height: previewSize.height * this.state.previewWidth / previewSize.width,
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
        />
      );
    }

    let preview = null;
    if (this.state.blob) {
      preview = <ImageView style={styles.preview} blob={this.state.blob} />;
    } else if (this.props.configurable) {
      preview = (
        <Text style={styles.newDevicePlus}>+</Text>
      );
    } else {
      preview = <ActivityIndicatorIOS color="white" />;
    }

    return (
      <TouchableOpacity
        onPress={this.props.onPress}
        style={[styles.monitorPreviewContainer, previewStyle]}>
        {preview}
        {logo}
        <View style={styles.monitorPreviewOverlay}>
          {objects}
        </View>
      </TouchableOpacity>
    );
  }
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
    backgroundColor: 'white',
    paddingTop: 5,
    marginTop: 5,
    marginBottom: 5,
    marginLeft: 8,
    marginRight: 7,
    flex: 1,
  },

  monitorLabelContainer: {
    paddingLeft: 10,
    paddingBottom: 5,
  },
  monitorLabel: {
    fontFamily: 'Open Sans',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#3a3a48',
    textAlign: 'left',
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
  },

  newDevicePlus: {
    color: 'white',
    fontSize: 120,
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

  monitorPreviewOverlay: {
    backgroundColor: 'transparent',
  },
});
