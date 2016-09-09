/**
 * @flow
 */

import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import createLog from 'silk-log';

import WebRTCDataChannelReceiver from './abstract/WebRTCDataChannelReceiver';
import PreviewQueue from '../libraries/PreviewQueue';
import * as actions from '../store/actions';

import type {RegisteredDevice} from 'silk-app-sdk/src/store/device_reducers';
import type {Dispatch} from 'silk-redux/action';

type Props = {
  device: RegisteredDevice;
  previewSize: {width: number, height: number};
  width: number;
  onPress?: Function;
  dispatch: Dispatch<*>;
};

const log = createLog('CameraPreview');

export default class CameraPreview extends WebRTCDataChannelReceiver {

  props: Props;

  state = {
    blob: null,
  };

  channelName: string = 'preview';
  messageType: string = 'jpeg';

  _timeoutTimer: ?number = null;

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillMount() {
    super.componentWillMount();
    this._queue = new PreviewQueue(this.props.device.name, (blob) => {
      if (!this.mounted) {
        return;
      }
      this.setStateAsync({blob});
    });
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
  }

  /**
   * "API"
   */
  onMessage = (message) => {
    log.debug('preview frame', message.frame);
    this._queue.push(message.frame);
  };

  _renderPreview() {
    const {rtc} = this.props.device;
    if (!rtc.peer && !rtc.connecting) {
      return (
        <Text style={styles.timedOutLabel}>
          No preview available. Device appears to be offline.
        </Text>
      );
    }
    const {blob} = this.state;
    if (rtc.connecting || !blob) {
      return <ActivityIndicator color="white" />;
    }
    return (
      <Image
        style={styles.preview}
        source={{uri: URL.createObjectURL(blob)}}
        onLoadEnd={() => blob.close()}
      />
    );
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
    const {rtc} = this.props.device;
    if (!rtc.peer && !rtc.connecting) {
      this._showRemoveDeviceSheet();
      return;
    }
    this.props.onPress();
  };

  _showRemoveDeviceSheet() {
    ActionSheetIOS.showActionSheetWithOptions({
      options: [
        'Remove Device',
        'Cancel',
      ],
      cancelButtonIndex: 1,
      destructiveButtonIndex: 0,
    }, (buttonIndex) => {
      if (buttonIndex === 1) {
        return;
      }
      const {deviceId} = this.props.device;
      this.props.dispatch(
        actions.devices.registered.unregister({devicePublicKey: deviceId})
      );
    });
  }
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
