import { OrderedMap } from 'immutable';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import { StyleSheet, View } from 'react-native';

import SocketIO from '../libraries/SocketIO';

import AsyncComponent from './abstract/AsyncComponent';
import MonitorPreview from './MonitorPreview';
import { ThumbnailStyles } from './CommonStyles';

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
    startFullscreenVideo: React.PropTypes.func,
  };

  state = {
    layoutWidth: null,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  _renderThumbnails() {
    let { devices } = this.props;
    let thumbnailWidth = this.state.layoutWidth;
    if (devices.size > 1) {
      thumbnailWidth = thumbnailWidth / 2;
    }
    return devices.map((device, deviceId) => (
      <MonitorPreview
        key={deviceId}
        deviceId={deviceId}
        label={device.name}
        logo={device.logo}
        previewSize={device.previewSize || DEFAULT_PREVIEW_SIZE}
        width={thumbnailWidth}
        haveVideoStream={device.haveVideoStream}
        onPress={() => this.props.startFullscreenVideo(deviceId)}
        socket={this.props.socket}
        hasNetwork={this.props.hasNetwork}
        bleDeviceSession={device.bleDeviceSession}
      />
    )).toArray().reverse();
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
