/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native'
import LiveVideo from './LiveVideo'
import OverlayModal from './OverlayModal'
import Rectangle from './Rectangle';
import FaceBoxes from './FaceBoxes';
import VideoControls from './VideoControls';
import { getLandscapeDimensions } from '../Libraries/DeviceConfig';
import TimerMixin from 'react-timer-mixin';
import uuid from 'uuid';

let {
  SliderIOS,
  StatusBarIOS,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} = React;

const MODES = {
  live: 'live',
  recorded: 'recorded',
  seeking: 'seeking'
};

const DEFAULT_MODE = MODES.live;

class LiveSegmentProvider {
  constructor(onSegment) {
    this.socket = null;
    this.id = null;
    this.lastId = null;

    this.onSegment = onSegment;

    // Ensure _provideSegment is consistently bound to this.
    this._provideSegment = this._provideSegment.bind(this);
  }

  _provideSegment(message) {
    // discard non video frames.
    if (message.contents !== 'mp4') {
      return;
    }

    // Create the segment from the frame.
    let id = uuid.v1();
    let segment = LiveVideo.Segment.fromFrame({
      data: message.frame,
      id,
      nextId: null,
      previousId: this.lastId,
      when: message.when,
      faces: message.faces
    });

    // Keep track of the previous id (required for state tracking).
    this.lastId = id;
    this.onSegment(segment);
  }

  start(socket, id) {
    this.socket = socket;
    this.id = id;

    let stream = `video-${id}`;
    socket.on(stream, this._provideSegment);
    socket.emit('join', stream);
  }

  stop() {
    let id = this.id;
    let socket = this.socket;
    let stream = `video-${id}`;
    socket.off(stream, this._provideSegment);
    socket.emit('leave', stream);
  }
}

/**
Safeguard if faces does not get a new value within this time reset to no faces.
*/
const FACE_DISAPPEAR = 50;
export default React.createClass({
  mixins: [TimerMixin],

  getInitialState() {
    return {
      mode: null, // initial unspecified mode
      shouldPlay: true,
      showingControls: true,
      faces: [],
      // Current time in the day we are viewing.
      seekTime: Date.now(),
      // Maximum time we have recorded for today.
      maxTime: Date.now(),
      videoSegments: [],
      liveSegmentProvider: new LiveSegmentProvider(this.onLiveSegment)
    }
  },

  getInitialProps() {
    return {
      presented: false,
      onClose: function() {}
    }
  },

  componentWillMount() {
    // List of video segments all mutations to state.videoSegments should first
    // happen in our private variable to maintain consistent state and to avoid
    // extra updates in some cases.
    this._videoSegments = [];
  },

  /**
  Appends a new video segment.
  */
  appendSegment(segment) {
    this._videoSegments = this._videoSegments.concat([segment]);
    this.setState({
      videoSegments: this._videoSegments
    });
  },

  onLiveSegment(segment) {
    this.appendSegment(segment);
    this.setState({ maxTime: segment.when });
  },

  /**
  Helper for managing state transitions between video modes.

  @param {String} newMode to set (see MODES).
  @param {Object} [state={}] additional state to set.
  */
  transitionModes(newMode, state = {}) {
    this.setState(function(previous) {
      if (previous.mode == MODES.live) {
        this._exitLiveMode();
      }

      if (newMode == MODES.live) {
        this._enterLiveMode();
      }

      let newState = {  mode: newMode };
      // If we transitioned to a non-seeking mode.
      if (newMode !== MODES.seeking && !('videoSegments' in state)) {
        this._videoSegments = [];
        newState.videoSegments = this._videoSegments;
      }

      return Object.assign(newState, state);
    });
  },

  _enterLiveMode() {
    let { socket, id } = this.props;
    this.state.liveSegmentProvider.start(socket, id);
  },

  _exitLiveMode() {
    let { socket, id } = this.props;
    this.state.liveSegmentProvider.stop(socket, id);
  },

  onShowStart() {
    // As we begin to display the overlay enter the default mode.
    this.transitionModes(DEFAULT_MODE);
  },

  onDismissStart() {
    // Run the same transition logic but to null (no new state).
    this.transitionModes(null);
  },

  createSegment(result) {
   return LiveVideo.Segment.fromURL({
      url: result.url,
      when: result.startUTC,
      faces: result.data.faces,
      id: result.id,
      nextId: result.nextId,
      previousId: result.previousId
    });
  },

  /**
  Called when any type of segment has ended. This is the same process for both
  live and recorded segment modes.
  */
  onSegmentEnd(event) {
    let segments = this._videoSegments;
    let current = segments[0];

    // If a different than expected segment ended.
    if ((!current || current.id !== event.nativeEvent.id) && segments.length) {
      throw new Error("Unexpected end event!");
      return;
    }

    // shift the finished segment off... Note we do not invoke setState here
    // this is purely to reconcile internal state and the state of the video
    // playback.
    this._videoSegments = segments.slice(1);
  },

  /**
  Invoked when any type of segment has begun playback.
  */
  onSegmentStart(event) {
    switch (this.state.mode) {
      // When a recorded segment starts we should begin buffering the next
      // segment.
      case MODES.recorded:
        this.onRecordedSegmentStart(event);
        break;
    }
  },

  onRecordedSegmentStart(event) {
    // new segment has started lets queue up the next one.
    let { api, id } = this.props;
    let video = this.refs.video;
    let segment = this._videoSegments[0];

    if (segment.type !== 'url') {
      throw new Error('Previous segment type _must_ be recorded');
    }

    if (!segment || !segment.nextId) {
      // We have reached the end of playable segments switch back to live.
      this.transitionModes(MODES.live);
      return;
    }

    api.timeMeta.findById({
      id: segment.nextId
    }).then(result => {
      let newSegment = this.createSegment(result);
      // Reconcile internal and video playback state.
      this.appendSegment(newSegment);
    });
  },

  onFaces(event) {
    let facesArray = event.nativeEvent.faces;
    this.clearTimeout(this.facesTimer);
    this.setState({ faces: facesArray });

    // Safe guard against never getting a message to zero out faces.
    // This happens infrequently (and may be a bug somewhere in event handling
    // or device side).
    this.facesTimer = this.setTimeout(() => {
      this.setState({ faces: [] });
    }, FACE_DISAPPEAR);
  },

  onTimeChange(event) {
    // Do not emit any time events while we are seeking...
    if (this.state.mode !== MODES.seeking) {
      let time = event.nativeEvent.time;
      this.setState({ currentTime: time });
    }
  },

  onSeekStart() {
    this._seeking = true;
    this.transitionModes(MODES.seeking, {
      shouldPlay: false
    });
  },

  onSeek(value) {},

  onSeekEnd(value) {
    this.setState({ shouldPlay: true });

    let api = this.props.api;
    let video = this.refs.video;

    api.timeMeta.findByTime({
      metaType: 'video',
      time: value,
      deviceId: this.props.id
    }).then(result => {
      // Override current pending segments.
      let segment = this.createSegment(result);

      // Extra logging for initial landing....
      console.log(
        `
          Seeking to new time segment:

            Wanted: ${new Date(value)}
            Got: ${new Date(segment.when)}
            ID: ${segment.id}
            NextID: ${segment.nextId}
        `
      );

      if (!segment.nextId) {
        console.warn(`Segment ${segment.id} has no next id!`);
      }

      this._videoSegments = [segment];
      // transition to recorded mode...
      this.transitionModes(MODES.recorded, {
        videoSegments: this._videoSegments
      });
    }).catch(err => {
      console.log('ERR switching to live video:', err);
      this.transitionModes(MODES.live);
    });
  },

  toggleControls() {
    this.setState({ showingControls: !this.state.showingControls });
  },

  render: function() {
    var videoStream = this.props.id;
    let { width, height } = getLandscapeDimensions();

    let faces;
    if (this.state.faces.length) {
      faces = <FaceBoxes width={width} height={height} faces={this.state.faces} />
    }

    let dimensions = { width, height };
    let controls;

    if (this.state.showingControls) {
      controls = (
        <VideoControls
          live={true}
          onSeekStart={this.onSeekStart}
          onSeek={this.onSeek}
          onSeekEnd={this.onSeekEnd}
          currentTime={this.state.currentTime}
          endTime={this.state.maxTime}
          onDone={this.close}
          width={width}
          height={height} />
      );
    }

    return (
      <OverlayModal ref="overlay"
                    onShowStart={this.onShowStart}
                    onDismissStart={this.onDismissStart}
                    onDismissEnd={this.onDismissEnd}
                    presented={this.props.presented}>

          <View style={[styles.container]}>
            <TouchableWithoutFeedback onPress={this.toggleControls}>
              <LiveVideo
                segments={this.state.videoSegments}
                shouldPlay={this.state.shouldPlay}
                onFaces={this.onFaces}
                onTimeChange={this.onTimeChange}
                onSegmentStart={this.onSegmentStart}
                onSegmentEnd={this.onSegmentEnd}
                style={styles.video}
                ref="video" />
            </TouchableWithoutFeedback>
            <View pointerEvents="box-none" style={[styles.videoOverlay, dimensions]}>
              {faces}
              {controls}
            </View>
          </View>
      </OverlayModal>
    )
  },

  close() {
    var overlay = this.refs.overlay;
    var video = this.refs.video;

    // Signal dismissal of the view (but let it animate closed)
    overlay.dismiss().then(() => {
      // After the animation allow any parent views to cleanup..
      this.props.onClose()
    });
  },
});

var styles = StyleSheet.create({
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

  timeOverlay: {
    fontFamily: 'AppleSDGothicNeo-SemiBold',
    color: 'white',
    opacity: 0.5,
    position: 'absolute',
    top: 10,
    left: 10,
    padding: 1,
    backgroundColor: 'black'
  },

  container: {
    flex: 1,
    backgroundColor: 'black'
  },
});
