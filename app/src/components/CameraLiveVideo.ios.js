import React from 'react';
import {
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import createLog from 'silk-log';

import OverlayModal from './OverlayModal';
import DashSegmentPlayer from './DashSegmentPlayer';
import VideoControls from './VideoControls';
import Spinner from './Spinner';
import * as DateUtil from '../libraries/DateUtil';
import { getLandscapeDimensions } from '../libraries/DeviceConfig';

const log = createLog('CameraLiveVideo');

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
    playing: false,
    currentTime: null,
    minTime: DateUtil.startOfDay().getTime(),
    maxTime: Date.now(),
  };

  firstSegmentDurationMs = null;
  videoStartTimestampDevice = null;

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
    this.refs.video.enqueue(message.frame);
  };

  _renderControls() {
    return (
      <VideoControls
        style={styles.videoControls}
        live={true}
        rate={1.0}
        playing={true}
        currentTime={this.state.currentTime}
        startTime={this.state.minTime}
        endTime={this.state.maxTime}
        onDone={this._close}
      />
    );
  }

  _onCanPlay = (event) => {
    // Delay playback by half a segment duration so that Viblast's
    // playhead isn't constantly at the edge of the buffer.
    const waitMs = this.firstSegmentDurationMs / 2;
    log.debug(`canPlay now, playing in ${waitMs}ms`);
    setTimeout(() => this.refs.video.play(), waitMs);
  };

  _onPlay = () => {
    this.setState({playing: true});
  };

  _onTimeUpdate = (event) => {
    log.debug('DashSegmentPlayer onTimeUpdate', event);
    this.setState({currentTime: this.videoStartTimestampDevice + event.currentTime * 1000});
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
    return <Spinner color="white" />;
  }

  render() {
    let dimensions = getLandscapeDimensions();
    let controls = null;
    if (this.state.showingControls) {
      controls = this._renderControls();
    }
    return (
      <OverlayModal ref="overlay" presented={true}>
        <View style={[styles.container]}>
          <TouchableWithoutFeedback onPress={this._toggleControls}>
            <View style={[styles.video, styles.videoContainer]}>
              <DashSegmentPlayer
                onCanPlay={this._onCanPlay}
                onPlay={this._onPlay}
                onTimeUpdate={this._onTimeUpdate}
                style={styles.video}
                ref="video"
              />
              {this._renderSpinner()}
            </View>
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
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
