import React from 'react-native';
import uuid from 'uuid';

import OverlayModal from './OverlayModal';
import DashSegmentPlayer from './DashSegmentPlayer';
import VideoControls from './VideoControls';
import * as DateUtil from '../libraries/DateUtil';
import { getLandscapeDimensions } from '../libraries/DeviceConfig';

const {
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} = React;

export default class CameraLiveVideo extends React.Component {

  static propTypes = {
    deviceId: React.PropTypes.string.isRequired,
    onClose: React.PropTypes.func,
  };

  // TODO: This should live in a separate component,
  // e.g. VideoControls, or VideoOverlay or something like that. We
  // don't want to retrigger a reflow across this entire component
  // every time these values change.
  state = {
    minTime: DateUtil.startOfDay().getTime(),
    maxTime: Date.now(),
  };

  mounted = false;

  componentWillMount() {
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
    let segment = {
      type: 'blob',
      blob: message.frame,
      id: uuid.v1(), // TODO: this is no longer necessary
      startUTC: message.when,
      endUTC: message.when + (message.durationMs || 0),
    };
    this.refs.video.enqueue(segment);
  };

  componentDidMount() {
    this.refs.video.play();
  }

  _renderControls() {
    return (
      <VideoControls
        style={styles.videoControls}
        live={true}
        rate={1.0}
        playing={true}
        onSeekStart={this.onSeekStart}
        onSeekChange={this.onSeekChange}
        onSeekEnd={this.onSeekEnd}
        onPlay={this.onPlay}
        onPause={this.onPause}
        onFastForward={this.onFastForward}
        onRewind={this.onRewind}
        currentTime={this.state.currentTime}
        startTime={this.state.minTime}
        endTime={this.state.maxTime}
        onDone={this.close}
      />
    );
  }

  onSeekStart() {
  }
  onSeekChange() {
  }
  onSeekEnd() {
  }
  onPlay() {
  }
  onPause() {
  }
  onFastForward() {
  }
  onRewind() {
  }

  close = () => {
    var overlay = this.refs.overlay;
    // Signal dismissal of the view (but let it animate closed).
    // After the animation allow any parent views to cleanup.
    overlay.dismiss().then(() => {
      this.props.onClose();
    });
  };

  toggleControls = () => {
    this.setState({
      showingControls: !this.state.showingControls,
    });
  };

  render() {
    let dimensions = getLandscapeDimensions();
    let controls = null;
    if (this.state.showingControls) {
      controls = this._renderControls();
    }
    return (
      <OverlayModal ref="overlay" presented={true}>
        <View style={[styles.container]}>
          <TouchableWithoutFeedback onPress={this.toggleControls}>
            <DashSegmentPlayer
              onTimeChange={this.onTimeChange}
              onSegmentEnqueued={this.onSegmentEnqueued}
              onSegmentStart={this.onSegmentStart}
              onSegmentEnd={this.onSegmentEnd}
              onSegmentError={this.onSegmentError}
              style={styles.video}
              ref="video"
            />
          </TouchableWithoutFeedback>
          <View pointerEvents="box-none" style={[styles.videoOverlay, dimensions]}>
            {controls}
          </View>
        </View>
      </OverlayModal>
    );
  }
}

const styles = StyleSheet.create({
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

  dateOverlay: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});
