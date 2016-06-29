import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

import PreviewQueue from '../libraries/PreviewQueue';
import SocketIO from '../libraries/SocketIO';
import SocketIOComponent from './abstract/SocketIOComponent';

const DEVICE_RECONNECT_PREVIEW_DELAY_MS = 1000;
const DEVICE_PREVIEW_TIMEOUT_MS = 10000;

export default class CameraPreview extends SocketIOComponent {
  static propTypes = {
    deviceId: React.PropTypes.string,
    previewSize: React.PropTypes.shape({
      width: React.PropTypes.number.isRequired,
      height: React.PropTypes.number.isRequired,
    }),
    width: React.PropTypes.number.isRequired,
    haveVideoStream: React.PropTypes.bool,
    onPress: React.PropTypes.func,

    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),
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


  _renderPreview() {
    // TODO: display this.props.haveVideoStream visually in some way.
    // See https://github.com/silklabs/silk-app/issues/526
    if (this.state.blob) {
      return (
        <Image
          style={styles.preview}
          source={{uri: URL.createObjectURL(this.state.blob)}}
          onLoadEnd={() => this.state.blob && this.state.blob.close()}
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
    return <ActivityIndicator color="white" />;
  }

  render() {
    let { width, previewSize } = this.props;
    let previewStyle = {
      width,
      height: previewSize.height * width / previewSize.width,
    };

    return (
      <TouchableOpacity
        onPress={this._onPress}
        style={[styles.previewContainer, previewStyle]}>
        {this._renderPreview()}
      </TouchableOpacity>
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
  previewContainer: {
    backgroundColor: '#99a0a4',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'white',
    borderWidth: 2,
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

  timedOutLabel: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
    padding: 8,
  },
});
