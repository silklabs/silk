import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import createLog from 'silk-log';

import OverlayModal from './OverlayModal';
import DashSegmentPlayer from './DashSegmentPlayer';
import { getLandscapeDimensions } from '../libraries/DeviceConfig';

const log = createLog('CameraLiveVideo');

export default class CameraLiveVideo extends React.Component {

  static propTypes = {
    deviceId: React.PropTypes.string.isRequired,
    onClose: React.PropTypes.func,
  };

  state = {
    playing: false,
  };

  firstSegmentDurationMs = null;

  mounted = false;

  componentDidMount() {
    this.mounted = true;

    const { socket, deviceId } = this.props;
    const stream = `video-${deviceId}`;
    socket.on(stream, this._receiveSegment);
    socket.join(stream);
  }

  componentWillUnmount() {
    this.mounted = false;

    const { socket, deviceId } = this.props;
    const stream = `video-${deviceId}`;
    socket.off(stream, this._receiveSegment);
    socket.leave(stream);
  }

  _receiveSegment = (message, ack) => {
    if (!this.mounted) {
      return;
    }
    if (typeof ack === 'function') {
      ack();
    }
    // discard non video frames.
    if (message.contents !== 'mp4') {
      return;
    }
    if (this.videoStartTimestampDevice === null) {
      this.videoStartTimestampDevice = message.when;
    }
    if (this.firstSegmentDurationMs === null) {
      this.firstSegmentDurationMs = message.durationMs;
    }
    this.refs.video.enqueue(message.frame).then(() => message.frame.close());
  };

  _renderControls() {
    if (!this.state.showingControls) {
      return null;
    }
    return (
      <View style={styles.controls}>
        <Text
          onPress={this._close}
          style={styles.doneButton}>
          Done
        </Text>
      </View>
    );
  }

  _onCanPlay = (event) => {
    // Delay playback by half a segment duration so that Viblast's
    // playhead isn't constantly at the edge of the buffer.
    const waitMs = this.firstSegmentDurationMs / 2;
    log.debug(`canPlay now, playing in ${waitMs}ms`);
    setTimeout(() => {
      if (!this.mounted) {
        return;
      }
      this.refs.video.play();
    }, waitMs);
  };

  _onPlay = () => {
    this.setState({playing: true});
  };

  _close = () => {
    // Signal dismissal of the view (but let it animate closed).
    // After the animation allow any parent views to cleanup.
    const overlay = this.refs.overlay;
    overlay.dismiss().then(() => this.props.onClose());
  };

  _toggleControls = () => {
    this.setState({
      showingControls: !this.state.showingControls,
    });
  };

  _renderSpinner() {
    if (this.state.playing) {
      return <View />;
    }
    return <ActivityIndicator color="white" />;
  }

  render() {
    let dimensions = getLandscapeDimensions();
    return (
      <OverlayModal ref="overlay" presented={true}>
        <View style={[styles.container]}>
          <TouchableWithoutFeedback onPress={this._toggleControls}>
            <View style={[styles.video, styles.videoContainer]}>
              <DashSegmentPlayer
                onCanPlay={this._onCanPlay}
                onPlay={this._onPlay}
                style={styles.video}
                ref="video"
              />
              {this._renderSpinner()}
            </View>
          </TouchableWithoutFeedback>
          <View pointerEvents="box-none" style={[styles.videoOverlay, dimensions]}>
            {this._renderControls()}
          </View>
        </View>
      </OverlayModal>
    );
  }
}

const styles = StyleSheet.create({
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  videoOverlay: {
    backgroundColor: 'transparent',
  },

  videoControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  doneButton: {
    padding: 10,
    fontSize: 14,
    color: 'black',
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
  },

  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});
