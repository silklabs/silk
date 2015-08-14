/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native'
import LiveVideo from './LiveVideo'
import OverlayModal from './OverlayModal'
import Rectangle from './Rectangle';
import ObjectBoxes from './ObjectBoxes';
import VideoControls from './VideoControls';
import { getLandscapeDimensions } from '../Libraries/DeviceConfig';
import TimerMixin from 'react-timer-mixin';
import uuid from 'uuid';
import * as DateUtils from '../Libraries/DateUtil';
import DateOverlay from './DateOverlay'

let {
  Animated,
  SliderIOS,
  StatusBarIOS,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} = React;

/**
Safeguard if faces does not get a new value within this time reset to no faces.
*/
const FACE_DISAPPEAR = 50;

const MODES = {
  live: 'live',
  recorded: 'recorded',
  seeking: 'seeking'
};

const DEFAULT_MODE = MODES.live;

/**
 * Playback speed steps.
 */
const PLAYBACK_STEPS = [
  // TODO: Add rewind (it is not yet supported in native layer).
  1.0,
  1.5,
  2.0,
  4.0
];

const DEFAULT_PLAYBACK_STEP = 1.0;

/**
 * The factor we use to determine if we have "jumped" a significant amount in
 * video playback.
 */
const JUMP_FACTOR = 2;

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
    let segment = new LiveVideo.Segment({
      type: 'data',
      data: message.frame,
      id,
      nextId: null,
      previousId: this.lastId,
      startUTC: message.when,
      // XXX: We should really send real duration in message.
      endUTC: message.when,
      faces: message.objects
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

export default React.createClass({
  mixins: [TimerMixin],

  getInitialState() {
    return {
      // Mode entered after seek is finished.
      pendingSeekMode: null,

      mode: null, // initial unspecified mode

      /**
       * When time jump is true we display a view showing the current time (it
       * will slowly fade away and we will reset this to false).
       */
      showTimeJump: false,

      /**
       * Playback rate 1.0 is playing 0.0 is paused (2.0 is 2x).
       */
      rate: DEFAULT_PLAYBACK_STEP,

      /**
       * Represents the UX state of playing/paused in some cases we may not be
       * actively playing video (such as seeking) when this is true.
       */
      playing: true,

      /**
       * Indicates to native layer if we should immediately begin playback of
       * segments as it receives them. This value may not match the value of
       * .playing in the case where we are seeking playing will be true if the
       * controls are not paused (and the video will begin playback after the
       * seek) and willPlay will be false to indicate to native not to begin
       * playback as we are actively seeking.
       */
      willPlay: true,

      showingControls: true,
      faces: [],
      currenTime: Date.now(),
      // Maximum time we have recorded for today.
      maxTime: Date.now(),
      minTime: DateUtils.startOfDay(),
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

    // Figure out start time for video:
    let startTime = DateUtils.startOfDay();

    let api = this.props.api;
    api.timeMeta.findOneAfterTime({
      deviceId: this.props.id,
      time: startTime.valueOf(),
      metaType: 'video'
    }).then(result => {
      this.setState({ minTime: result.startUTC });
    }).catch(err => {
      console.log('Could not fetch initial time: ', err);
    });
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
    if (this._videoSegments.length === 0) {
      console.log('set lag');
      this.liveVideoLag = Date.now() - segment.startUTC;
    }

    this.appendSegment(segment);
    this.setState({ maxTime: segment.startUTC });
  },

  /**
  Helper for managing state transitions between video modes.

  @param {String} newMode to set (see MODES).
  @param {Object} [state={}] additional state to set.
  */
  transitionModes(newMode, state = {}) {
    this.setState(function(previous) {
      switch (previous.mode) {
        case MODES.live:
          this._exitLiveMode();
          break;
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
   return new LiveVideo.Segment({
      type: 'url',
      url: result.url,
      startUTC: result.startUTC,
      endUTC: result.endUTC,
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
  onSegmentStart() {
    let segment = this._videoSegments[0];

    // Emit a segment start event so we can do processing based on segment
    // specific events.
    if (segment) {
      segment.fireStartCallbacks();
    }

    switch (this.state.mode) {
      // When a recorded segment starts we should begin buffering the next
      // segment.
      case MODES.recorded:
        this.bufferNextRecordedSegment();
        break;
      case MODES.seeking:
        // Intentionally left blank when we seek we should not be running
        // additional buffering operations/etc...
        break;
    }
  },

  bufferNextRecordedSegment() {
    // new segment has started lets queue up the next one.
    let segment = this._videoSegments[0];
    let { api, id } = this.props;
    let video = this.refs.video;

    if (segment.type !== 'url') {
      throw new Error('Previous segment type _must_ be recorded');
    }

    if (!segment || !segment.nextId) {
      // We have reached the end of playable segments switch back to live.
      console.log('No next playable segments resuming live');
      this.transitionModes(MODES.live);
      return;
    }

    api.timeMeta.findById({
      id: segment.nextId
    }).then(result => {
      let newSegment = this.createSegment(result);
      let delta = result.startUTC - segment.startUTC;
      let previousDuration = segment.endUTC - segment.startUTC;

      if (delta > previousDuration * JUMP_FACTOR) {
        newSegment.addStartCallback(() => {
          this.setState({ showTimeJump: true });
        });
      }

      // Reconcile internal and video playback state.
      this.appendSegment(newSegment);
      console.log(
        'queueing next segment', delta, newSegment
      );
    });
  },

  onFaces(event) {
    this.clearTimeout(this.facesTimer);
    this.setState({ faces: [event.nativeEvent]});

    // Safe guard against never getting a message to zero out faces.
    // This happens infrequently (and may be a bug somewhere in event handling
    // or device side).
    this.facesTimer = this.setTimeout(() => {
      this.setState({ faces: [] });
    }, FACE_DISAPPEAR);
  },

  modifyLiveRate(segment, time) {
    let currentLag = Date.now() - time - this.liveVideoLag;

    if (this._videoSegments.length > 1 && currentLag > 0) {
      let rate = 1 + currentLag / 1000
      this.setState({ rate: rate });
      console.log('new rate:', rate);
    }
  },

  onTimeChange(event) {
    // Let seek bar manage it's own state in video controls.
    if (this.state.mode === MODES.seeking) {
      // Do not emit any time events while we are seeking...
      return
    }

    let time = event.nativeEvent.time;
    let segment = this._videoSegments[0];

    if (this.state.mode == MODES.live) {
      this.modifyLiveRate(segment, time);
    }

    this.setState({ currentTime: time });
  },

  onSeekStart() {
    this.transitionModes(MODES.seeking, {
      // Reset playback speed when we start seeking.
      rate: DEFAULT_PLAYBACK_STEP,
      // Used to signify what mode to enter after seeking is done.
      pendingSeekMode: DEFAULT_MODE,
      // Playback is paused while we seek.
      willPlay: false
    });
  },

  onSeekChange(value) {
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
            Got: ${new Date(segment.startUTC)}
            ID: ${segment.id}
            NextID: ${segment.nextId}
        `
      );

      if (!segment.nextId) {
        console.warn(`Segment ${segment.id} has no next id!`);
      }

      // Load segment and show preview:
      this._videoSegments = [segment];
      this.setState({
        currentTime: segment.startUTC,
        pendingSeekMode: MODES.recorded,
        videoSegments: this._videoSegments
      });
    }).catch(err => {
      console.log('Could not find segment in seek time', err);
      // Fallback if we cannot find a recorded segment to start playback at we
      // will resume this mode after seeking is done.
      this._videoSegments = []
      this.setState({
        videoSegments: this._videoSegments,
        pendingSeekMode: DEFAULT_MODE
      });
    });
  },

  onSeekEnd(value) {
    console.log('on seek end', this.state.pendingSeekMode);
    this.transitionModes(this.state.pendingSeekMode, {
      pendingSeekMode: null,
      // Resume playback mode (paying/paused).
      willPlay: this.state.playing,
      // Pass video segments explicitly so we do not reset them.
      videoSegments: this._videoSegments
    });

    // If we are now in recorded mode start buffering next segment.
    if (this.state.pendingSeekMode === MODES.recorded) {
      this.bufferNextRecordedSegment();
    }
  },

  toggleControls() {
    this.setState({ showingControls: !this.state.showingControls });
  },

  /**
   * Calculate the playback rate based on current value + increment.
   */
  getPlaybackStep(increment) {
    let currentIdx = PLAYBACK_STEPS.indexOf(this.state.rate);
    if (currentIdx === -1) {
      throw new Error(`Invalid rate was used: ${this.state.rate}`);
    }

    let nextId = currentIdx + increment;

    if (nextId < 0) {
      return PLAYBACK_STEPS[0]
    }

    if (nextId >= PLAYBACK_STEPS.length) {
      return PLAYBACK_STEPS[PLAYBACK_STEPS.length - 1];
    }

    return PLAYBACK_STEPS[nextId];
  },

  onFastForward() {
    let rate = this.getPlaybackStep(1);
    this.setState({ rate: rate })
    console.log('fast forward', rate);
  },

  onRewind() {
    let rate = this.getPlaybackStep(-1);
    this.setState({ rate: rate })
  },

  onPlay() {
    this.setState({
      rate: DEFAULT_PLAYBACK_STEP,
      playing: true,
      willPlay: true
    });
  },

  onPause() {
    this.setState({
      // Reset rate when we pause.
      rate: DEFAULT_PLAYBACK_STEP,
      playing: false,
      willPlay: false
    });
  },

  hideTimeJump() {
    this.setState({ showTimeJump: false });
  },

  buildControls() {
    return (
      <VideoControls
        style={styles.videoControls}
        live={this.state.mode === MODES.live}
        rate={this.state.rate}
        playing={this.state.playing}
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
        onDone={this.close} />

    );
  },

  render: function() {
    var videoStream = this.props.id;
    let { width, height } = getLandscapeDimensions();

    let faces;
    if (this.state.faces.length) {
      faces = <ObjectBoxes
                width={width}
                height={height}
                objects={this.state.faces}
                previewSize={this.props.previewSize} />
    }

    let dimensions = { width, height };
    let controls;

    if (this.state.showingControls) {
      controls = this.buildControls();
    }

    let showTimeJump;
    if (this.state.showTimeJump) {
      showTimeJump = (
        <DateOverlay
          onDone={this.hideTimeJump}
          style={styles.dateOverlay}
          date={new Date(this.state.currentTime)} />
      );
    }

    let date = (
      <DateOverlay
        style={styles.dateOverlay}
        date={new Date(this.state.currentTime)} />
    );

    return (
      <OverlayModal ref="overlay"
                    onShowStart={this.onShowStart}
                    onDismissStart={this.onDismissStart}
                    onDismissEnd={this.onDismissEnd}
                    presented={this.props.presented}>

          <View style={[styles.container]}>
            <TouchableWithoutFeedback onPress={this.toggleControls}>
              <LiveVideo
                rate={this.state.rate}
                segments={this.state.videoSegments}
                willPlay={this.state.willPlay}
                onFaces={this.onFaces}
                onTimeChange={this.onTimeChange}
                onSegmentStart={this.onSegmentStart}
                onSegmentEnd={this.onSegmentEnd}
                style={styles.video}
                ref="video" />
            </TouchableWithoutFeedback>
            <View pointerEvents="box-none" style={[styles.videoOverlay, dimensions]}>
              {showTimeJump}
              {controls}
              {faces}
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

  videoControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },

  dateOverlay: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
    flex: 1
  },

  container: {
    flex: 1,
    backgroundColor: 'black'
  },
});
