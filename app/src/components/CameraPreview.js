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
  onPress: Function;
  dispatch: Dispatch<*>;
};

const log = createLog('CameraPreview');

const PAIRING_TIMEOUT_MS = 30 * 1000;

export default class CameraPreview extends WebRTCDataChannelReceiver {

  props: Props;

  state = {
    blob: null,
    pairingTimedOut: false,
  };

  channelName: string = 'preview';
  messageType: string = 'jpeg';

  _timeoutTimer: ?number = null;
  _pairing: boolean = false;

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

  componentWillReceiveProps(nextProps: Props) {
    if (this._pairing) {
      const {deviceId, ble} = this.props.device;
      const nextBLE = nextProps.device.ble;

      // Clear the timeout if we successfully connected to the device.
      if (!ble.session && nextBLE.session) {
        clearTimeout(this._timeoutTimer);
        this._timeoutTimer = null;
      }

      // Automatically close the BLE connection if we created it for
      // pairing and pairing was successful.
      if (ble.unauthorized && nextBLE.unauthorized === false) {
        this.props.dispatch(actions.devices.ble.disconnect(deviceId));
        this._pairing = false;
        if (this.state.pairingTimedOut) {
          this.setState({pairingTimedOut: false});
        }
      }
    }
    super.componentWillReceiveProps(nextProps);
  }

  /**
   * "API"
   */
  onMessage = (message) => {
    log.debug('preview frame', message.frame);
    this._queue.push(message.frame);
  };

  _renderPreview() {
    const {rtc, ble} = this.props.device;
    if (rtc.connecting) {
      return <ActivityIndicator color="white" />;
    }
    if (rtc.unauthorized) {
      if (ble.connectionRequested && !ble.session) {
        return <ActivityIndicator color="white" />;
      }
      let label = 'Not paired yet. Tap to pair via Bluetooth.';
      if (this.state.pairingTimedOut) {
        label = (
          `Could not connect to device via Bluetooth. ` +
          `Ensure you're in close proximity to the device ` +
          `and tap again to pair.`
        );
      } else if (ble.session && ble.unauthorized) {
        label = (
          'Connected via Bluetooth. ' +
          'Hold the phone close to the device to pair.'
        );
      } else if (ble.session && !ble.unauthorized) {
        label = 'Successfully paired!';
      }
      return <Text style={styles.timedOutLabel}>{label}</Text>;
    }
    if (!rtc.peer && !rtc.connecting) {
      return (
        <Text style={styles.timedOutLabel}>
          No preview available. Device appears to be offline.
        </Text>
      );
    }
    const {blob} = this.state;
    if (!blob) {
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

  _onPress() {
    const {rtc, ble} = this.props.device;
    if (rtc.unauthorized) {
      if (ble.connectionRequested || ble.session) {
        return;
      }
      this._pairDevice();
      return;
    }
    if (!rtc.peer && !rtc.connecting) {
      this._showRemoveDeviceSheet();
      return;
    }
    this.props.onPress();
  }

  _onPress: () => void = this._onPress.bind(this);

  _pairDevice() {
    const {deviceId} = this.props.device;
    this._pairing = true;
    this.props.dispatch(
      actions.devices.ble.connect(deviceId)
    );
    this._timeoutTimer = setTimeout(() => {
      this.props.dispatch(actions.devices.ble.disconnect(deviceId));
      this._pairing = false;
      this.setState({pairingTimedOut: true});
    }, PAIRING_TIMEOUT_MS);
  }

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
        actions.devices.registered.unregisterBegin({devicePublicKey: deviceId})
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
