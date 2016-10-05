/**
 * Like `MSEPlayer`, but provides statistics about video streaming and
 * playback via the an `onStatsUpdate` callback.
 *
 * @flow
 */

import invariant from 'assert';
import React from 'react';
import createLog from 'silk-log';

import MSEPlayer from './MSEPlayer';

import type { Segment } from 'silk-cam';

type Stats = {
  elapsedMs: number;
  playbackMs: number;
  deviceToClientLagMs: ?number,
  totalDroppedMs: number;
  totalStalledMs: number;
  totalOutOfBufferMs: number;
  totalOutOfBufferCompensatedMs: number;
  totalBufferedMs: number;
  reloadCount: number;
};

const log = createLog('MSEPlayerStats');

// Ignore when we're not buffered for less than a frame.
const MIN_OUT_OF_BUFFER_MS = 30;

// The absolute minimum duration we can expect all segments to have.
const MIN_SEGMENT_DURATION_MS = 100;

const KETCHUP_BEHIND_THRESHOLD_MS = 200;
const KETCHUP_PLAYBACK_RATE = 2;

const initialStats: Stats = {
  elapsedMs: 0,
  playbackMs: 0,
  deviceToClientLagMs: null,
  totalDroppedMs: 0,
  totalStalledMs: 0,
  totalOutOfBufferMs: 0,
  totalOutOfBufferCompensatedMs: 0,
  totalBufferedMs: 0,
  reloadCount: 0,
};

export default class MSEPlayerWithStats extends React.Component {

  stats: Stats = Object.assign({}, initialStats);

  // Note: make sure you account for new members in `_init()` below!
  videoStartTimestamp: ?number;
  expectNextSegmentTimestamp: ?number;
  lastStalledTimestamp: ?number;
  emptyBufferTimestamp: ?number;
  emptyBufferVideoStartTimeOffsetMs: number = 0;
  outOfBufferTimer: ?number;
  outOfBuffer: boolean = false;
  previousSegmentEndTimeMs: ?number;
  ketchupStartTimestamp: ?number;

  outOfBufferTimer: ?number;
  updateTimer: ?number;
  ketchupTimer: ?number;

  static propTypes = {
    onStatsUpdate: React.PropTypes.func,
    maxStatsUpdateIntervalMs: React.PropTypes.number,
    ...MSEPlayer.propTypes,
  };

  get videoElement(): ?HTMLVideoElement {
    return this.refs.player && this.refs.player.videoElement;
  }

  componentDidMount() {
    this._init();
    this._dispatchStatsUpdate();
  }

  _dispatchStatsUpdate: (() => void) = () => {
    if (!this.props.onStatsUpdate) {
      return;
    }

    // Consumer can specify that they want to be updated every X ms or more often.
    clearTimeout(this.updateTimer);
    this.updateTimer = null;
    if (this.props.maxStatsUpdateIntervalMs) {
      this.updateTimer = setTimeout(
        this._dispatchStatsUpdate,
        this.props.maxStatsUpdateIntervalMs
      );
    }

    const {videoStartTimestamp} = this;
    if (videoStartTimestamp) {
      this.stats.elapsedMs = Date.now() - videoStartTimestamp;
    }
    if (this.videoElement) {
      this.stats.playbackMs = this.videoElement.currentTime * 1000;
    }
    this.props.onStatsUpdate(Object.assign({}, this.stats));
  };

  componentWillUnmount() {
    clearTimeout(this.outOfBufferTimer);
    clearTimeout(this.ketchupTimer);
  }

  feedSegmentData(segmentData: ArrayBuffer, deviceTimestamp: number): Segment {
    const segment = this.refs.player.feedSegmentData(segmentData);

    // Calculate device-to-client lag. Also figure out if we dropped
    // any segments. Given the current segment's duration and device
    // timestamp, we can figure out what timestamp the next segment
    // segment should have. We record any discrepancies.
    this.stats.deviceToClientLagMs = Date.now() - deviceTimestamp;
    let delta = 0;
    if (this.expectNextSegmentTimestamp) {
      delta = deviceTimestamp - this.expectNextSegmentTimestamp;
    }
    if (delta >= MIN_SEGMENT_DURATION_MS) {
      this.stats.totalDroppedMs += delta;
    }
    this._dispatchStatsUpdate();

    this.expectNextSegmentTimestamp = deviceTimestamp + segment.videoDurationTimeMs;
    return segment;
  }

  forceReload() {
    this.refs.player.forceReload();
  }

  _init() {
    clearTimeout(this.outOfBufferTimer);
    clearTimeout(this.ketchupTimer);

    this.stats = Object.assign({}, initialStats);

    this.videoStartTimestamp = null;
    this.expectNextSegmentTimestamp = null;
    this.lastStalledTimestamp = null;
    this.emptyBufferTimestamp = null;
    this.emptyBufferVideoStartTimeOffsetMs = 0;
    this.outOfBufferTimer = null;
    this.outOfBuffer = false;
    this.previousSegmentEndTimeMs = null;
  }

  _onVideoStalledOrResumed(event: Event) {
    log.debug(`Video playback ${event.type}`);
    if (event.type === 'playing') {
      if (this.videoStartTimestamp === null) {
        this.videoStartTimestamp = Date.now();
      }
      const lastStalledTimestamp = this.lastStalledTimestamp;
      if (!lastStalledTimestamp) {
        log.debug(`Video resuming, but no previously recorded stall. Ignoring.`);
        return;
      }
      const delta = Date.now() - lastStalledTimestamp;
      log.debug(`Video resuming after ${delta} ms stall.`);

      this.lastStalledTimestamp = null;
      this.stats.totalStalledMs += delta;
      this._dispatchStatsUpdate();
      return;
    }

    if (this.lastStalledTimestamp !== null) {
      log.debug(`Already recorded earlier stalled timestamp. Not overwriting.`);
      return;
    }
    log.debug(`Video stalled.`);
    this.lastStalledTimestamp = Date.now();
  }

  _onSegmentEnqueued: ((segment: Segment) => void) = (segment) => {
    // Are we getting a segment having been out of buffered data? If
    // so, record the time we presumably spent without having any
    // buffered data.
    const timeSinceLastOutOfBuffer =
      Date.now() - (this.emptyBufferTimestamp || 0);
    let timeOutOfBuffer = 0;
    if (this.outOfBuffer) {
      const timePreviouslyBuffered =
        (this.previousSegmentEndTimeMs || 0) -
        this.emptyBufferVideoStartTimeOffsetMs;
      timeOutOfBuffer = timeSinceLastOutOfBuffer - timePreviouslyBuffered;
      log.debug(
        `We were apparently out of buffered data for ${timeOutOfBuffer} ms.`
      );
    }

    if (this.outOfBuffer || this.emptyBufferTimestamp === null) {
      this.emptyBufferTimestamp = Date.now();
      this.emptyBufferVideoStartTimeOffsetMs = segment.videoStartTimeMs;
      this.outOfBuffer = false;
    }
    this.previousSegmentEndTimeMs = segment.videoStartTimeMs + segment.videoDurationTimeMs;

    // Calculate the time when we'd expect the <video> element to be
    // out of buffered data.
    invariant(this.videoElement);
    const currentVideoTimeMs = this.videoElement.currentTime * 1000;
    const outOfBufferMs = this.previousSegmentEndTimeMs - currentVideoTimeMs;
    log.debug(`Expecting <video> element to run out of buffered data in ${outOfBufferMs} ms`);
    clearTimeout(this.outOfBufferTimer);
    this.outOfBufferTimer = setTimeout(this._onOutOfBuffer, outOfBufferMs);

    if (timeOutOfBuffer < MIN_OUT_OF_BUFFER_MS) {
      timeOutOfBuffer = 0;
    }

    const {stats} = this;
    stats.totalBufferedMs = segment.videoStartTimeMs;
    stats.totalOutOfBufferMs += timeOutOfBuffer;
    stats.totalOutOfBufferCompensatedMs += timeOutOfBuffer;
    this._dispatchStatsUpdate();

    const extraneousBufferedMs =
      stats.totalBufferedMs -
      stats.playbackMs -
      segment.videoDurationTimeMs;
    log.debug(`Have ${extraneousBufferedMs}ms worth of extraneous buffer ` +
              `beyond recently enqueued segment.`);
    if (!this.ketchupStartTimestamp &&
        extraneousBufferedMs > KETCHUP_BEHIND_THRESHOLD_MS &&
        stats.totalOutOfBufferCompensatedMs > timeOutOfBuffer) {
      this._playKetchup(extraneousBufferedMs - KETCHUP_BEHIND_THRESHOLD_MS);
    }

    this.props.onSegmentEnqueued && this.props.onSegmentEnqueued(segment);
  };

  _playKetchup(durationMs: number) {
    const videoElement = this.videoElement;
    if (!videoElement) {
      log.warn(`No video element found.`);
      return;
    }
    log.debug(`Going to catch up ${durationMs}ms.`);
    this.ketchupStartTimestamp = Date.now();
    videoElement.playbackRate = KETCHUP_PLAYBACK_RATE;
    this.ketchupTimer = setTimeout(
      this._endKetchup,
      durationMs / KETCHUP_PLAYBACK_RATE
    );
  }

  _endKetchup: (() => void) = () => {
    const videoElement = this.videoElement;
    if (!videoElement) {
      log.warn(`No video element found.`);
      return;
    }
    const {ketchupStartTimestamp} = this;
    if (typeof ketchupStartTimestamp !== 'number') {
      return;
    }

    videoElement.playbackRate = 1.0;
    const actualKetchupDurationMs = Date.now() - ketchupStartTimestamp;
    this.ketchupStartTimestamp = null;
    log.debug(`Managed to catch up ${actualKetchupDurationMs}ms`);

    this.stats.totalOutOfBufferCompensatedMs -= actualKetchupDurationMs;
    this._dispatchStatsUpdate();
  };

  _onReload: (() => void) = () => {
    log.debug('Video element reloaded');
    const reloadCount = this.stats.reloadCount;
    this._init();
    this.stats.reloadCount = reloadCount + 1;
    this._dispatchStatsUpdate();
    this.props.onReload && this.props.onReload();
  };

  _onOutOfBuffer: (() => void) = () => {
    log.debug(`Expecting <video> element to be out of buffered data at this point.`);
    this.outOfBuffer = true;
  };


  _onStalled: ((event: Event) => void) = (event) => {
    this._onVideoStalledOrResumed(event);
    this.props.onStalled && this.props.onStalled(event);
  };

  _onWaiting: ((event: Event) => void) = (event) => {
    this._onVideoStalledOrResumed(event);
    this.props.onWaiting && this.props.onWaiting(event);
  };

  _onPlaying: ((event: Event) => void) = (event) => {
    this._onVideoStalledOrResumed(event);
    this.props.onPlaying && this.props.onPlaying(event);
  };

  render() {
    return (
      <MSEPlayer
        ref="player"
        {...this.props}
        onStalled={this._onStalled}
        onWaiting={this._onWaiting}
        onPlaying={this._onPlaying}
        onSegmentEnqueued={this._onSegmentEnqueued}
        onReload={this._onReload}
      />
    );
  }
}
