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
import createLog from 'silk-log';

import AsyncComponent from './abstract/AsyncComponent';
import PreviewQueue from '../libraries/PreviewQueue';

const log = createLog('CameraPreview');

const DEVICE_PREVIEW_TIMEOUT_MS = 10000;

export default class CameraPreview extends AsyncComponent {
  static propTypes = {
    deviceId: React.PropTypes.string,
    previewSize: React.PropTypes.shape({
      width: React.PropTypes.number.isRequired,
      height: React.PropTypes.number.isRequired,
    }),
    width: React.PropTypes.number.isRequired,
    hasNetwork: React.PropTypes.bool.isRequired,
    onPress: React.PropTypes.func,
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

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillMount() {
    this.mounted = true;
    this._queue = new PreviewQueue(this.props.label, frame => {
      if (!this.mounted) {
        return;
      }
      this.setStateAsync({
        timedOut: false,
        blob: frame,
      });
    });
    this.startTimeoutTimer();
  }

  componentWillUnmount() {
    this.mounted = false;
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
    this.clearTimeoutTimer();
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.hasNetwork && nextProps.hasNetwork) {
      this.startTimeoutTimer();
    }
    if (this.props.hasNetwork && !nextProps.hasNetwork) {
      this.clearTimeoutTimer();
    }
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

  /**
   * "API"
   */
  resetTimeout() {
    this.setState({timedOut: false, blob: null});
    this.startTimeoutTimer();
  }

  pushFrame(frame) {
    log.debug('preview frame', frame);
    this._queue.push(frame);
    this.startTimeoutTimer();
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
      } catch (ex) {
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
