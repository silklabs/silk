import React from 'react-native';
import uuid from 'uuid';
import createLog from 'log';

import { getLandscapeDimensions } from '../libraries/DeviceConfig';
import Config from '../libraries/Config';
import * as DateUtil from '../libraries/DateUtil';

import LiveVideo from './LiveVideo';
import OverlayModal from './OverlayModal';
import ObjectBoxes from './ObjectBoxes';
import VideoControls from './VideoControls';
import DateOverlay from './DateOverlay';

const log = createLog('MonitorFullscreen');

const {
  AlertIOS,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} = React;

const MODES = {
  live: 'live',
  recorded: 'recorded',
  seeking: 'seeking',
};

/**
 * Playback speed steps.
 */
const PLAYBACK_STEPS = [
  // TODO: Add rewind (it is not yet supported in native layer).
  1.0,
  1.5,
  2.0,
  4.0,
];

const DEFAULT_PLAYBACK_STEP = 1.0;

/**
 * The factor we use to determine if we have "jumped" a significant amount in
 * video playback.
 */
const JUMP_FACTOR = 2;

/**
 * If `true`, continuously adjust the playback rate to try to catch up
 * to real-time.  In theory, the rate adjustments should be subtle
 * enough that users won't notice, and can hide small bubbles in the
 * playback pipeline.
 *
 * Unfortunately, see https://github.com/silklabs/silk-app/issues/298
 */
const ENABLE_CONTINUOUS_RATE_ADJUSTMENT = false;

function segmentMeterId(segment) {
  // Use the segment's start timestamp as its meter ID, because
  // device, server, and app always see this same value tagged on
  // the segment metadata.
  return '' + segment.startUTC;
}

class Meter {
  constructor(tag, socket, deviceId) {
    this.tag = tag;
    this.socket = socket;
    this.deviceId = deviceId;
  }

  meter(what, id = '', whenMs = Date.now()) {
    this.socket.emit('diag', {
      id: this.deviceId,
      type: this.tag,
      log: { id, what, whenMs, nowMs: Date.now() },
    });
  }

  stop() {
    this.socket.emit('diag', {
      id: this.deviceId,
      type: this.tag,
      log: {
        what: 'exit',
        whenMs: Date.now(),
      },
    });
  }
}

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
      previousId: this.lastId,
      startUTC: message.when,
      endUTC: message.when + (message.durationMs || 0),
      objects: message.objects,
    });

    // Keep track of the previous id (required for state tracking).
    this.lastId = id;
    this.onSegment(segment, message);
  }

  start(socket, id) {
    this.socket = socket;
    this.id = id;

    let stream = `video-${id}`;
    socket.on(stream, this._provideSegment);
    socket.join(stream);
  }

  stop() {
    let id = this.id;
    let socket = this.socket;
    let stream = `video-${id}`;
    socket.off(stream, this._provideSegment);
    socket.leave(stream);
  }
}

export default class MonitorFullscreen extends React.Component {

  /**
   * Used to hold the promise of a pending seek operation.
   */
  _pendingSeekOperation = null;

  /**
   * Holds list of video segments to be played.
   *
   * All mutations to state.videoSegments should first happen in this
   * private member to maintain consistent state and to avoid extra
   * updates in some cases.
   */
  _videoSegments = [];

  state = {
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
    currentTime: null,
    // Maximum time we have recorded for today.
    maxTime: Date.now(),
    minTime: DateUtil.startOfDay().getTime(),
    videoSegments: [],

    /**
     * Set of detected objects (faces, cars, motion, etc) that have
     * been detected for the currently-playing segment at the
     * current time point (give or take some milliseconds).
     */
    objects: [],
  };

  getInitialProps() {
    return {
      onClose: function() {},
    };
  }

  mounted = false;

  componentWillMount() {
    this.mounted = true;

    this._liveSegmentProvider = new LiveSegmentProvider(this.onLiveSegment);
    if (this.props.startAtTime) {
      this._playRecorded(this.props.startAtTime);
    } else {
      this.transitionModes(MODES.live);
    }

    this.determineMinTime();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  determineMinTime() {
    // Figure out start time for video:
    let startTime = DateUtil.startOfDay();

    this.props.api.metadata.findOneAfterTime({
      deviceId: this.props.deviceId,
      time: startTime.valueOf(),
      metaType: 'video',
    }).then((result) => {
      if (this.mounted) {
        this.setState({ minTime: result.startUTC });
      }
    }, (err) => {
      // TODO: should we show an error in the UI here? If so, what and where?
      log.info('Could not fetch initial time: ', err);
    });
  }

  /**
   * Appends a new video segment.
   */
  appendSegment(segment) {
    if (!this.mounted) {
      return;
    }
    this._videoSegments = this._videoSegments.concat([segment]);
    this.setState({
      videoSegments: this._videoSegments,
    });
  }

  onLiveSegment = (segment, message) => {
    if (this._videoSegments.length === 0) {
      this.liveVideoLag = Date.now() - segment.startUTC;
      log.debug('updated live video lag to', this.liveVideoLag);
    }

    this.appendSegment(segment);
    this.setState({ maxTime: segment.startUTC });

    let meterId = segmentMeterId(segment);
    // TODO: we could batch meters if it's more efficient
    this.meter.meter('recordStart', meterId, segment.startUTC);
    this.meter.meter('recordEnd', meterId, segment.endUTC);
    this.meter.meter('deviceEmit', meterId, message.deviceEmitMs);
    this.meter.meter('serverEmit', meterId, message.serverEmitMs);
    this.meter.meter('arriveApp', meterId);
  };

  /**
   * Helper for managing state transitions between video modes.
   */
  transitionModes(newMode, state = {}) {
    if (!this.mounted) {
      return;
    }
    this.setState(function(previous) {
      switch (previous.mode) {
        case MODES.live:
          this._exitLiveMode();
          break;
        default:
          // Ignore
          break;
      }

      if (newMode === MODES.live) {
        this._enterLiveMode();
      }

      let newState = { mode: newMode };
      // If we transitioned to a non-seeking mode.
      if (newMode !== MODES.seeking && !('videoSegments' in state)) {
        this._videoSegments = [];
        newState.videoSegments = this._videoSegments;
      }

      return Object.assign(newState, state);
    });
  }

  _enterLiveMode() {
    let { socket, deviceId } = this.props;
    this._liveSegmentProvider.start(socket, deviceId);

    this.meter = new Meter('avpipeline', socket, deviceId);
  }

  _exitLiveMode() {
    let { socket, deviceId } = this.props;
    this._liveSegmentProvider.stop(socket, deviceId);
    if (this.meter) {
      this.meter.stop();
      this.meter = null;
    }
  }

  createSegment(result, previousSegment) {
    return new LiveVideo.Segment({
      type: 'url',
      url: result.url,
      startUTC: result.startUTC,
      endUTC: result.endUTC,
      id: result.id,
      previousId: previousSegment ? previousSegment.id : null,
      objects: result.data.objects,
    });
  }

  onSegmentError = (event) => {
    log.info('Segment error encountered!', event.nativeEvent);
  };

  /**
   * Invoked when a segment has finished loading and has been added to
   * the play queue.
   */
  onSegmentEnqueued = (event) => {
    if (this.meter) {
      this.meter.meter('playbackEnqueued', segmentMeterId(event.nativeEvent));
    }
  };

  /**
   * Called when any type of segment has ended. This is the same
   * process for both live and recorded segment modes.
   */
  onSegmentEnd = (event) => {
    let segments = this._videoSegments;
    let current = segments[0];

    if (this.meter) {
      this.meter.meter('playbackEnd', segmentMeterId(event.nativeEvent));
    }
    // If a different than expected segment ended.
    if ((!current || current.id !== event.nativeEvent.id) && segments.length) {
      log.info(`
        Unexpected end event:

          current: ${current}
          notification to remove: ${event.nativeEvent.id}
          ids: ${segments.map(v => v.id)}
      `);
      throw new Error('Unexpected end event!');
    }

    // shift the finished segment off... Note we do not invoke setState here
    // this is purely to reconcile internal state and the state of the video
    // playback.
    this._videoSegments = segments.slice(1);
  };

  /**
   * Invoked when any type of segment has begun playback.
   */
  onSegmentStart = (event) => {
    let segment = this._videoSegments[0];

    if (segment && this.meter) {
      let meterId = segmentMeterId(segment);
      let startMs = Date.now();
      let durationMs = segment.endUTC - segment.startUTC;
      this.meter.meter('playbackStart', meterId, startMs);
      this.meter.meter('segmentDuration', meterId, startMs + durationMs);
    }
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
      default:
        // Ignore
        break;
    }

    if (segment) {
      this.setState({
        objects: this.getActiveObjects(segment, segment.startUTC),
      });
    }
  };

  bufferNextRecordedSegment() {
    // new segment has started lets queue up the next one.
    let segment = this._videoSegments[0];

    if (segment.type !== 'url') {
      throw new Error('Previous segment type _must_ be recorded');
    }

    if (!segment || !segment.startUTC) {
      // We have reached the end of playable segments switch back to live.
      log.info('No next playable segments resuming live');
      this.transitionModes(MODES.live);
      return;
    }

    this.props.api.metadata.findOneAfterTime({
      deviceId: this.props.deviceId,
      metaType: 'video',
      time: segment.startUTC + 1,
    }).then(result => {
      let newSegment = this.createSegment(result, segment);
      let delta = result.startUTC - segment.startUTC;
      let previousDuration = segment.endUTC - segment.startUTC;

      if (delta > previousDuration * JUMP_FACTOR) {
        newSegment.addStartCallback(() => {
          this.setState({ showTimeJump: true });
        });
      }

      // Reconcile internal and video playback state.
      log.info(
        'queueing next segment', delta, newSegment
      );
      this.appendSegment(newSegment);
    }, (err) => {
      log.info('Could not buffer next recorded segment: ', err);
      this.close().then(() => {
        AlertIOS.alert(
          'Video Playback Failed',
          'Could not fetch video data.'
        );
      });
    });
  }

  modifyLiveRate(segment, time) {
    if (!ENABLE_CONTINUOUS_RATE_ADJUSTMENT) {
      return this.setState({ rate: 1.0 });
    }

    let currentLag = Date.now() - time - this.liveVideoLag;

    if (currentLag > 0) {
      let rate = 1 + currentLag / 1000;
      this.setState({ rate: rate });
    }
  }

  onTimeChange = (event) => {
    // Let seek bar manage it's own state in video controls.
    if (this.state.mode === MODES.seeking) {
      // Do not emit any time events while we are seeking...
      return;
    }

    let time = event.nativeEvent.time;
    let segment = this._videoSegments[0];

    if (this.state.mode === MODES.live) {
      this.modifyLiveRate(segment, time);
    }

    this.setState({
      currentTime: time,
      objects: this.getActiveObjects(segment, time),
    });
  };

  onSeekStart = () => {
    this.transitionModes(MODES.seeking, {
      // Reset playback speed when we start seeking.
      rate: DEFAULT_PLAYBACK_STEP,
      // Used to signify what mode to enter after seeking is done.
      pendingSeekMode: MODES.live,
      // Playback is paused while we seek.
      willPlay: false,
    });
  };

  onSeekChange = (value) => {
    // For now we don't change the video display during seek events.
  };

  onSeekEnd = (value) => {
    this._playRecorded(value);
  };

  _playRecorded(startTime) {
    // Clear the segment queue and update the time to the seek target
    // while we figure out where we're actually going to end up below.
    this._videoSegments = [];
    this.setState({
      currentTime: startTime,
      pendingSeekMode: MODES.recorded,
      videoSegments: this._videoSegments,
    });

    // TODO: what should we do here if there's a previous seek
    // operation still pending?  For now we assume these don't
    // overlap.
    this._pendingSeekOperation = this.props.api.metadata.findOneNear({
      metaType: 'video',
      time: startTime,
      deviceId: this.props.deviceId,
    }).then((result) => {
      if (!this.mounted) {
        return;
      }

      // Override current pending segments.
      let segment = this.createSegment(result);

      // Extra logging for initial landing....
      log.info(
        `
          Seeking to new time segment:

            Wanted: ${new Date(startTime)}
            Got: ${new Date(segment.startUTC)}
            ID: ${segment.id}
        `
      );

      // Load segment and show preview:
      this._videoSegments = [segment];
      this.setState({
        currentTime: segment.startUTC,
        pendingSeekMode: MODES.recorded,
        videoSegments: this._videoSegments,
      });

      this._pendingSeekOperation = null;

      this.transitionModes(this.state.pendingSeekMode, {
        pendingSeekMode: null,
        // Resume playback mode (paying/paused).
        willPlay: this.state.playing,
        // Pass video segments explicitly so we do not reset them.
        videoSegments: this._videoSegments,
      });

      // If we are now in recorded mode start buffering next segment.
      if (this.state.pendingSeekMode === MODES.recorded) {
        this.bufferNextRecordedSegment();
      }

      return;
    }, (err) => {
      log.info('Could not find segment in seek time', err);
      if (!this.mounted) {
        return;
      }

      this.close().then(() => {
        AlertIOS.alert(
          'Recorded Video Unavailable',
          'Could not find recorded video for the specified time.'
        );
      });
    });
  }

  toggleControls = () => {
    this.setState({ showingControls: !this.state.showingControls });
  };

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
      return PLAYBACK_STEPS[0];
    }

    if (nextId >= PLAYBACK_STEPS.length) {
      return PLAYBACK_STEPS[PLAYBACK_STEPS.length - 1];
    }

    return PLAYBACK_STEPS[nextId];
  }

  getActiveObjects(segment, timeUTC) {
    if (!segment || !segment.objects) {
      return [];
    }
    return segment.objects.filter(obj => {
      // TODO/FIXME: it's super gross that we're guessing this
      // information on the client side.  When we track a real event
      // timeline and have start/end for each event, this code should
      // diaf.
      switch (obj.tag) {
      case 'hal':
        // hal-detected faces can happen multiple times per frame.  We
        // guess that any given detection event is about 75ms, but of
        // course in reality it's far more variable.  (See above.)
        const HAL_PERIOD_MS = 75;
        return (obj.when <= timeUTC
                && timeUTC <= (obj.when + HAL_PERIOD_MS));
      default:
        // Assume other events occur just once per frame.  (See
        // above.)
        return true;
      }
    });
  }

  onFastForward = () => {
    let rate = this.getPlaybackStep(1);
    this.setState({ rate });
    log.debug('fast forward', rate);
  };

  onRewind = () => {
    let rate = this.getPlaybackStep(-1);
    this.setState({ rate });
  };

  onPlay = () => {
    this.setState({
      rate: DEFAULT_PLAYBACK_STEP,
      playing: true,
      willPlay: true,
    });
  };

  onPause = () => {
    this.setState({
      // Reset rate when we pause.
      rate: DEFAULT_PLAYBACK_STEP,
      playing: false,
      willPlay: false,
    });
  };

  hideTimeJump = () => {
    this.setState({ showTimeJump: false });
  };

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
        onDone={this.close}
      />
    );
  }

  render() {
    let { width, height } = getLandscapeDimensions();
    let dimensions = { width, height };
    let controls;

    if (this.state.showingControls) {
      controls = this.buildControls();
    }

    let objects = null;
    if (Config.get().preferences.drawObjectBoxesFullscreenVideo
        && this.state.objects.length) {
      objects = (
        <ObjectBoxes
          deviceId={this.props.deviceId}
          socket={this.props.socket}
          width={width}
          height={height}
          objects={this.state.objects}
          previewSize={this.props.previewSize}
        />
      );
    }

    let showTimeJump;
    if (this.state.showTimeJump) {
      showTimeJump = (
        <DateOverlay
          onDone={this.hideTimeJump}
          style={styles.dateOverlay}
          date={new Date(this.state.currentTime)}
        />
      );
    }

    return (
      <OverlayModal ref="overlay" presented={true}>
          <View style={[styles.container]}>
            <TouchableWithoutFeedback onPress={this.toggleControls}>
              <LiveVideo
                rate={this.state.rate}
                segments={this.state.videoSegments}
                willPlay={this.state.willPlay}
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
              {showTimeJump}
              {controls}
              {objects}
            </View>
          </View>
      </OverlayModal>
    );
  }

  close = () => {
    var overlay = this.refs.overlay;
    // Signal dismissal of the view (but let it animate closed).
    // After the animation allow any parent views to cleanup.
    return overlay.dismiss().then(() => {
      this.transitionModes(null);
      this.props.onClose();
    });
  };
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
