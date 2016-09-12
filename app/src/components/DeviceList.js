/**
 * @flow
 */

import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {lockToLandscape, lockToPortrait} from 'react-native-orientation';

import AsyncComponent from './abstract/AsyncComponent';
import CameraLiveVideoRTC from './CameraLiveVideoRTC';
import CameraPreview from './CameraPreview';
import {Colors} from './CommonStyles';
import UnconfiguredDevice from './UnconfiguredDevice';

import type {RegisteredDevice} from 'silk-app-sdk/src/store/device_reducers';
import type {GlobalProps} from './Root';

// This is mostly a guestimate based on FUT hardware. Absolute values
// not important here, the ratio is what matters.
const DEFAULT_PREVIEW_WIDTH = 16;
const DEFAULT_PREVIEW_HEIGHT = 9;
export const DEFAULT_PREVIEW_SIZE = {
  width: DEFAULT_PREVIEW_WIDTH,
  height: DEFAULT_PREVIEW_HEIGHT,
};

export default class DeviceList extends AsyncComponent {

  props: GlobalProps;

  state = {
    fullscreenDeviceId: null,
    cameraPreviewWidth: null,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  startFullscreenVideo = (device: RegisteredDevice) => {
    this.setStateAsync({fullscreenDeviceId: device.deviceId})
      .then(lockToLandscape);
  };

  stopFullscreenVideo = () => {
    this.setStateAsync({fullscreenDeviceId: null})
      .then(() => setTimeout(lockToPortrait, 0));
  };

  render() {
    const {network, devices} = this.props;
    const {registered, unconfigured} = devices;

    // this.props.devices === null means we haven't fetched a list of devices yet,
    // so we're still loading from network.
    if (!registered && !unconfigured.size) {
      if (!network.canReachServer) {
        return this._renderOffline();
      }
      return (
        <View style={styles.content}>
          {this._renderSpinner()}
        </View>
      );
    }

    if (registered && !registered.size && !unconfigured.size) {
      return this._renderNoDevices();
    }

    let { fullscreenDeviceId } = this.state;
    let fullscreenMonitor = null;
    if (fullscreenDeviceId) {
      const device = registered.get(fullscreenDeviceId);
      fullscreenMonitor = (
        <CameraLiveVideoRTC
          onClose={this.stopFullscreenVideo}
          peer={device.rtc.peer}
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
    const {unconfigured} = this.props.devices;
    if (!unconfigured.size) {
      return null;
    }

    return Array.from(unconfigured).map(([key, bleDeviceSession]) => (
      <UnconfiguredDevice
        key={'unconfiguredDevice-' + key}
        style={styles.unconfiguredDevice}
        configDeviceId={bleDeviceSession.socketId}
        dispatch={this.props.dispatch}
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
    const {registered} = this.props.devices;
    if (!registered) {
      return null;
    }
    return Array.from(registered.values()).reverse().map((device) => (
      <View style={styles.cameraPreview} key={device.deviceId}>
        <Text style={styles.cameraPreviewLabel}>
          {device.name}
        </Text>
        <CameraPreview
          dispatch={this.props.dispatch}
          device={device}
          previewSize={DEFAULT_PREVIEW_SIZE}
          width={this.state.cameraPreviewWidth}
          onPress={() => this.startFullscreenVideo(device)}
        />
      </View>
    ));
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
