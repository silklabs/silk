import { OrderedMap, OrderedSet } from 'immutable';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SilkApi } from 'silk-api';

import SocketIO from '../libraries/SocketIO';

import AsyncComponent from './abstract/AsyncComponent';
import CameraLiveVideo from './CameraLiveVideo';
import CameraPreviewSocketIO from './CameraPreviewSocketIO';
import CameraPreviewWebRTC from './CameraPreviewWebRTC';
import { Colors } from './CommonStyles';
import UnconfiguredDevice from './UnconfiguredDevice';

// This is mostly a guestimate based on FUT hardware. Absolute values
// not important here, the ratio is what matters.
const DEFAULT_PREVIEW_WIDTH = 16;
const DEFAULT_PREVIEW_HEIGHT = 9;
export const DEFAULT_PREVIEW_SIZE = {
  width: DEFAULT_PREVIEW_WIDTH,
  height: DEFAULT_PREVIEW_HEIGHT,
};

export default class DeviceList extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),

    devices: React.PropTypes.instanceOf(OrderedMap),
    unconfiguredDevices: React.PropTypes.instanceOf(OrderedSet),
  };

  state = {
    fullscreenDeviceId: null,
    cameraPreviewWidth: null,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  startFullscreenVideo = (fullscreenDeviceId) => {
    if (Platform.OS === 'ios') {
      this.setStateAsync({fullscreenDeviceId});
    } else {
      this.props.navigator.pushAsync({
        name: 'CameraLiveVideo',
        props: {
          ...this.props,
          deviceId: fullscreenDeviceId,
        },
      });
    }
  };

  stopFullscreenVideo = () => {
    this.setStateAsync({fullscreenDeviceId: null});
  };

  _getPreviewSize(deviceId) {
    let device = this.props.devices.get(deviceId);
    if (device &&
        device.previewSize &&
        device.previewSize.width &&
        device.previewSize.height) {
      return device.previewSize;
    }
    return DEFAULT_PREVIEW_SIZE;
  }

  _getDeviceName(deviceId) {
    let device = this.props.devices.get(deviceId);
    return device ? device.name : 'unknown device';
  }

  render() {
    const {
      hasNetwork,
      devices,
      unconfiguredDevices,
    } = this.props;

    // this.props.devices === null means we haven't fetched a list of devices yet,
    // so we're still loading from network.
    if (!devices && !unconfiguredDevices.size) {
      if (!hasNetwork) {
        return this._renderOffline();
      }
      return (
        <View style={styles.content}>
          {this._renderSpinner()}
        </View>
      );
    }

    if (devices && !devices.size && !unconfiguredDevices.size) {
      return this._renderNoDevices();
    }

    let { fullscreenDeviceId } = this.state;
    let fullscreenMonitor = null;
    if (fullscreenDeviceId) {
      fullscreenMonitor = (
        <CameraLiveVideo
          {...this.props}
          onClose={this.stopFullscreenVideo}
          deviceId={fullscreenDeviceId}
          previewSize={this._getPreviewSize(fullscreenDeviceId)}
          startAtTime={this.state.fullscreenStartTime}
        />
      );
    }

    return (
      <View style={styles.wrapper}>
        {fullscreenMonitor}
        <View style={styles.content}>
          <ScrollView
            style={styles.scrollView}
            automaticallyAdjustContentInsets={true}
            scrollEventThrottle={5}
            onScroll={this.onScroll}>
            {this._renderUnconfiguredDevices()}
            {this._renderThumbnails()}
          </ScrollView>
        </View>
      </View>
    );
  }

  _renderOffline() {
    return (
      <View style={styles.content}>
        <Text style={styles.placeholderLabel}>
          Not connected.
        </Text>
      </View>
    );
  }

  _renderSpinner() {
    return (
      <ActivityIndicator
        size="large"
        style={styles.loadingSpinner}
      />
    );
  }

  _renderNoDevices() {
    return (
      <View style={styles.content}>
        <Text style={styles.placeholderLabel}>
          Turn on a Silk device to get started
        </Text>
      </View>
    );
  }

  _renderUnconfiguredDevices() {
    const { unconfiguredDevices } = this.props;
    if (!unconfiguredDevices.size) {
      return null;
    }

    return unconfiguredDevices.toArray().map((bleDeviceSession, index) => (
      <UnconfiguredDevice
        key={'unconfiguredDevice-' + index}
        style={styles.unconfiguredDevice}
        bleDeviceSession={bleDeviceSession}
      />
    ));
  }

  _renderThumbnails() {
    if (this.state.cameraPreviewWidth === null) {
      return (
        <View
          style={styles.cameraPreview}
          onLayout={(event) => this.setStateAsync({cameraPreviewWidth: event.nativeEvent.layout.width})}
        />
      );
    }
    const { devices } = this.props;
    if (!devices) {
      return null;
    }
    return devices.map((device, deviceId) => (
      <View key={deviceId}>
        <View style={styles.cameraPreview}>
          <Text style={styles.cameraPreviewLabel}>
            {device.name} (socket.io)
          </Text>
          <CameraPreviewSocketIO
            deviceId={deviceId}
            previewSize={device.previewSize || DEFAULT_PREVIEW_SIZE}
            width={this.state.cameraPreviewWidth}
            hasNetwork={this.props.hasNetwork}
            onPress={() => this.startFullscreenVideo(deviceId)}
            socket={this.props.socket}
            haveVideoStream={device.haveVideoStream}
          />
        </View>
        <View style={styles.cameraPreview}>
          <Text style={styles.cameraPreviewLabel}>
            {device.name} (WebRTC)
          </Text>
          <CameraPreviewWebRTC
            deviceId={deviceId}
            previewSize={device.previewSize || DEFAULT_PREVIEW_SIZE}
            width={this.state.cameraPreviewWidth}
            hasNetwork={this.props.hasNetwork}
            onPress={() => this.startFullscreenVideo(deviceId)}
            rtcConnection={device.rtcConnection}
          />
        </View>
      </View>
    )).toArray().reverse();
  }

}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  content: {
    backgroundColor: Colors.SilkLabsTan,
    flex: 1,
  },
  loadingSpinner: {
    marginVertical: 12,
  },
  placeholderLabel: {
    margin: 8,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.SilkLabsBlack,
  },
  scrollView: {
    paddingTop: 5,
    flex: 1,
  },
  unconfiguredDevice: {
    margin: 16,
  },
  cameraPreview: {
    marginHorizontal: 24,
    marginVertical: 12,
  },
  cameraPreviewLabel: {
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.SilkLabsBlack,
    marginBottom: 4,
  },
});
