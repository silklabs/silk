import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  ActionSheetIOS,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { DeviceSession } from '../libraries/ble/DeviceManager';
import PreviewQueue from '../libraries/PreviewQueue';
import SocketIO from '../libraries/SocketIO';
import { blobURI } from '../libraries/Util';

import SocketIOComponent from './abstract/SocketIOComponent';
import { ThumbnailStyles, THUMBNAIL_MARGIN } from './CommonStyles';
import Spinner from './Spinner';

const DEVICE_RECONNECT_PREVIEW_DELAY_MS = 1000;
const DEVICE_PREVIEW_TIMEOUT_MS = 10000;

export default class MonitorPreview extends SocketIOComponent {
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
    timedOut: false,
  };

  mounted: false;
  _timeoutTimer = null;

  componentWillMount() {
    this.mounted = true;
    this._queue = new PreviewQueue(this.props.label, message => {
      if (!this.mounted) {
        return;
      }
      this.setStateAsync({
        timedOut: false,
        blob: message.frame,
      });
    });

    if (this.props.haveVideoStream) {
      this.subscribeToSocket();
    }
    this.startTimeoutTimer();
  }

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillReceiveProps(nextProps) {
    if (!this.props.haveVideoStream && nextProps.haveVideoStream) {
      // The device was known to us before, but only just now came
      // online. Start subscribing to the device's socket.io room to
      // receive preview images. However, for some reason, subscribing
      // to it immediately can lead to not receiving any messages at all.
      // See https://github.com/silklabs/silk-app/issues/577.
      // Also, in anticipation of receiving preview images soon, clear any
      // timeout state.
      this.unsubscribeFromSocket(this.props.socket);
      this.startTimeoutTimer();
      this.setState({timedOut: false, blob: null});
      setTimeout(() => {
        this.subscribeToSocket(this.props.socket);
      }, DEVICE_RECONNECT_PREVIEW_DELAY_MS);
    }
    if (!this.props.hasNetwork && nextProps.hasNetwork) {
      this.startTimeoutTimer();
    }
    if (this.props.hasNetwork && !nextProps.hasNetwork) {
      this.clearTimeoutTimer();
    }
  }

  subscribeToSocket(socket) {
    let { deviceId } = this.props;
    if (!socket || !deviceId || !this.mounted) {
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
    this.clearTimeoutTimer();
    let timeOut = DEVICE_PREVIEW_TIMEOUT_MS;
    this._timeoutTimer = setTimeout(
      () => {
        if (!this.props.hasNetwork) {
          return;
        }
        this.setStateAsync({timedOut: true, blob: null});
      },
      timeOut
    );
  }

  clearTimeoutTimer() {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
    }
  }

  onPreviewFrame = (message, ack) => {
    if (typeof ack === 'function') {
      ack();
    }
    this._queue.push(message);
    this.startTimeoutTimer();
  };

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeFromSocket(this.props.socket);
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
    this.clearTimeoutTimer();
  }


  _renderLabel() {
    let { label, bleDeviceSession } = this.props;
    if (bleDeviceSession) {
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
      return (
        <Image
          style={styles.preview}
          source={{uri: blobURI(this.state.blob)}}
        />
      );
    }
    if (this.state.timedOut) {
      return (
        <Text style={styles.timedOutLabel}>
          No preview available. Device appears to be offline.
        </Text>
      );
    }
    return <Spinner color="white" />;
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
        <Image
          style={styles.logo}
          source={{uri: blobURI(this.props.logo)}}
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
        </TouchableOpacity>
      </View>
    );
  }

  _onPress = () => {
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
        Alert.alert(
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
    resizeMode: 'stretch',
  },

  timedOutLabel: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
    padding: 8,
  },
});
