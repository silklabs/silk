import { OrderedMap, OrderedSet } from 'immutable';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SilkApi } from 'silk-api';

import SocketIO from '../libraries/SocketIO';

import AsyncComponent from './abstract/AsyncComponent';
import { ConfiguringDeviceRecord } from './abstract/Devices';
import CameraLiveVideo from './CameraLiveVideo';
import { Colors } from './CommonStyles';
import PreviewThumbnails from './PreviewThumbnails';
import { DEFAULT_PREVIEW_SIZE } from './PreviewThumbnails';
import Spinner from './Spinner';
import UnconfiguredDevice from './UnconfiguredDevice';

class MonitorsView extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),

    devices: React.PropTypes.instanceOf(OrderedMap),
    unconfiguredDevices: React.PropTypes.instanceOf(OrderedSet),
    configuringDevice: React.PropTypes.instanceOf(ConfiguringDeviceRecord),
  };

  state = {
    fullscreenDeviceId: null,
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
    let {
      hasNetwork,
      devices,
      unconfiguredDevices,
      configuringDevice,
    } = this.props;

    // this.props.devices === null means we haven't fetched a list of devices yet,
    // so we're still loading from network.
    if (!devices) {
      if (!hasNetwork) {
        return this._renderOffline();
      }
      return (
        <View style={styles.content}>
          {this._renderSpinner()}
        </View>
      );
    }

    if (!devices.size && !unconfiguredDevices.size && !configuringDevice) {
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
            <PreviewThumbnails
              {...this.props}
              startFullscreenVideo={this.startFullscreenVideo}
            />
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
      <Spinner
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
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },

  content: {
    backgroundColor: Colors.SilkLabsTan,
    borderColor: '#c8c7cc',
    borderTopWidth: 1 / PixelRatio.get(),
    flex: 1,
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

  eventRow: {
    padding: 10,
  },
});

module.exports = MonitorsView;
