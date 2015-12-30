import React from 'react-native';
import { OrderedMap, OrderedSet } from 'immutable';

import SocketIO from '../libraries/SocketIO';
import { shouldPureComponentUpdate } from '../libraries/Util';

import AsyncComponent from './abstract/AsyncComponent';
import { ConfiguringDeviceRecord } from './abstract/Devices';
import MonitorPreview from './MonitorPreview';
import { ThumbnailStyles } from './CommonStyles';

const {
  StyleSheet,
  View,
} = React;

// This is mostly a guestimate based on FUT hardware. Absolute values
// not important here, the ratio is what matters.
const DEFAULT_PREVIEW_WIDTH = 16;
const DEFAULT_PREVIEW_HEIGHT = 9;
export const DEFAULT_PREVIEW_SIZE = {
  width: DEFAULT_PREVIEW_WIDTH,
  height: DEFAULT_PREVIEW_HEIGHT,
};

export default class PreviewThumbnails extends AsyncComponent {

  static propTypes = {
    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),
    devices: React.PropTypes.instanceOf(OrderedMap),
    unconfiguredDevices: React.PropTypes.instanceOf(OrderedSet),
    configuringDevice: React.PropTypes.instanceOf(ConfiguringDeviceRecord),
    startFullscreenVideo: React.PropTypes.func,
  };

  state = {
    layoutWidth: null,
  };

  shouldComponentUpdate = shouldPureComponentUpdate;

  _renderThumbnails() {
    let { devices, unconfiguredDevices, configuringDevice } = this.props;

    let thumbnailWidth = this.state.layoutWidth;
    if (devices.size + unconfiguredDevices.size > 1) {
      thumbnailWidth = thumbnailWidth / 2;
    }

    let unconfiguredDeviceThumbnails = unconfiguredDevices.toArray().reverse()
    .map((bleDeviceSession, index) => {
      if (configuringDevice && configuringDevice.bleDeviceSession === bleDeviceSession) {
        return null;
      }
      return (
        <MonitorPreview
          key={'unconfiguredDevice-' + index}
          label={`${bleDeviceSession.manufacturer} ${bleDeviceSession.model}`}
          previewSize={DEFAULT_PREVIEW_SIZE}
          width={thumbnailWidth}
          configurable={true}
          configuring={false}
          haveVideoStream={false}
          socket={this.props.socket}
          hasNetwork={this.props.hasNetwork}
          bleDeviceSession={bleDeviceSession}
        />
      );
    });

    let configuringDeviceThumbnail = null;
    if (configuringDevice) {
      let { bleDeviceSession } = configuringDevice;
      configuringDeviceThumbnail = (
        <MonitorPreview
          key={configuringDevice.deviceId}
          deviceId={configuringDevice.deviceId}
          label={configuringDevice.name || `${bleDeviceSession.manufacturer} ${bleDeviceSession.model}`}
          previewSize={DEFAULT_PREVIEW_SIZE}
          width={thumbnailWidth}
          configurable={false}
          configuring={true}
          haveVideoStream={false}
          socket={this.props.socket}
          hasNetwork={this.props.hasNetwork}
          bleDeviceSession={configuringDevice.bleDeviceSession}
        />
      );
    }

    let deviceThumbnails = devices.map((device, deviceId) => (
      <MonitorPreview
        key={deviceId}
        deviceId={deviceId}
        label={device.name}
        logo={device.logo}
        previewSize={device.previewSize || DEFAULT_PREVIEW_SIZE}
        width={thumbnailWidth}
        configurable={false}
        configuring={false}
        haveVideoStream={device.haveVideoStream}
        onPress={() => this.props.startFullscreenVideo(deviceId)}
        socket={this.props.socket}
        hasNetwork={this.props.hasNetwork}
        bleDeviceSession={device.bleDeviceSession}
      />
    )).toArray().reverse();

    return unconfiguredDeviceThumbnails
      .concat(configuringDeviceThumbnail)
      .concat(deviceThumbnails)
      .filter((element) => !!element);
  }

  render() {
    if (this.state.layoutWidth === null) {
      // Measure layout so we know how large to display the preview images.
      return (
        <View
          style={[styles.thumbnailContainer, ThumbnailStyles.thumbnailContainer]}
          onLayout={(event) => this.setStateAsync({layoutWidth: event.nativeEvent.layout.width})}
        />
      );
    }
    return (
      <View style={[styles.thumbnailContainer, ThumbnailStyles.thumbnailContainer]}>
        {this._renderThumbnails()}
      </View>
    );
  }

}

const styles = StyleSheet.create({
  thumbnailContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
