import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import createLog from 'silk-log';

import DashSegmentPlayer from './DashSegmentPlayer';

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
          onPress={this.props.onClose}
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
    return (
      <Modal visible={true}>
        <View style={styles.container}>
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
          <View
            style={[styles.video, styles.videoOverlay]}
            pointerEvents="box-none">
            {this._renderControls()}
          </View>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  videoContainer: {
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

  doneButton: {
    padding: 10,
    fontSize: 14,
    color: 'black',
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
  },

  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
  },
});
