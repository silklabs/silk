/**
 * Wrap `MSEPlayer` and display statistics about video streaming and
 * playback.
 */

import React from 'react';
import createLog from 'silk-log';

import MSEPlayer from './MSEPlayer';

import type { Segment } from 'silk-cam';

const log = createLog('MSEPlayerStats');

// Ignore when we're not buffered for less than a frame.
const MIN_OUT_OF_BUFFER_MS = 30;

function formatMs(number) {
  return `${(number / 1000).toFixed(2)}s`;
}

function formatDeltaMs(number) {
  if (number > 0) {
    return '+' + formatMs(number);
  }
  return formatMs(number);
}

export default class MSEPlayerWithStats extends React.Component {

  // Note: make sure you account for new members in `_init()` below!
  videoStartTimestamp: ?number;
  expectNextSegmentTimestamp: ?number;
  lastStalledTimestamp: ?number;
  emptyBufferTimestamp: ?number;
  emptyBufferVideoStartTimeOffsetMs: number = 0;
  outOfBufferTimer: ?number;
  outOfBuffer: boolean = false;
  previousSegmentEndTimeMs: ?number;

  static _initialState = {
    deviceToClientLagMs: null,
    totalDroppedMs: 0,
    totalStalledMs: 0,
    totalOutOfBufferMs: 0,
    totalBufferedMs: 0,
    reloadCount: 0,
  };

  state = Object.assign({}, MSEPlayerWithStats._initialState);

  get videoElement(): ?HTMLVideoElement {
    return this.refs.player && this.refs.player.videoElement;
  }

  componentDidMount() {
    this._init();
  }

  componentWillUnmount() {
    if (this.outOfBufferTimer) {
      clearTimeout(this.outOfBufferTimer);
    }
  }

  feedSegmentData(segmentData: ArrayBuffer, deviceTimestamp: number): Segment {
    const segment = this.refs.player.feedSegmentData(segmentData);

    // Calculate device-to-client lag. Also figure out if we dropped
    // any segments. Given the current segment's duration and device
    // timestamp, we can figure out what timestamp the next segment
    // segment should have. We record any discrepancies.
    let delta = 0;
    if (this.expectNextSegmentTimestamp !== null) {
      delta = deviceTimestamp - this.expectNextSegmentTimestamp;
    }
    const deviceToClientLagMs = Date.now() - deviceTimestamp;
    requestAnimationFrame(() => this.setState({
      deviceToClientLagMs,
      totalDroppedMs: this.state.totalDroppedMs + delta,
    }));

    this.expectNextSegmentTimestamp = deviceTimestamp + segment.videoDurationTimeMs;
    return segment;
  }

  _init() {
    if (this.outOfBufferTimer) {
      clearTimeout(this.outOfBufferTimer);
    }

    this.videoStartTimestamp = null;
    this.expectNextSegmentTimestamp = null;
    this.lastStalledTimestamp = null;
    this.emptyBufferTimestamp = null;
    this.emptyBufferVideoStartTimeOffsetMs = 0;
    this.outOfBufferTimer = null;
    this.outOfBuffer = false;
    this.previousSegmentEndTimeMs = null;
  }

  _onVideoStalledOrResumed(event) {
    log.debug(`Video playback ${event.type}`);
    if (event.type === 'playing') {
      if (this.videoStartTimestamp === null) {
        this.videoStartTimestamp = Date.now();
      }
      if (this.lastStalledTimestamp === null) {
        log.debug(`Video resuming, but no previously recorded stall. Ignoring.`);
        return;
      }
      const delta = Date.now() - this.lastStalledTimestamp;
      log.debug(`Video resuming after ${delta} ms stall.`);

      this.lastStalledTimestamp = null;
      requestAnimationFrame(() => this.setState({
        totalStalledMs: this.state.totalStalledMs + delta,
      }));
      return;
    }

    if (this.lastStalledTimestamp !== null) {
      log.debug(`Already recorded earlier stalled timestamp. Not overwriting.`);
      return;
    }
    log.debug(`Video stalled.`);
    this.lastStalledTimestamp = Date.now();
  }

  _onSegmentEnqueued = (segment) => {
    // Are we getting a segment having been out of buffered data? If
    // so, record the time we presumably spent without having any
    // buffered data.
    const timeSinceLastOutOfBuffer = Date.now() - this.emptyBufferTimestamp;
    let timeOutOfBuffer = 0;
    if (this.outOfBuffer) {
      const timePreviouslyBuffered =
        this.previousSegmentEndTimeMs - this.emptyBufferVideoStartTimeOffsetMs;
      timeOutOfBuffer = timeSinceLastOutOfBuffer - timePreviouslyBuffered;
      log.debug(`We were apparently out of buffered data for ${timeOutOfBuffer} ms.`);
    }

    if (this.outOfBuffer || this.emptyBufferTimestamp === null) {
      this.emptyBufferTimestamp = Date.now();
      this.emptyBufferVideoStartTimeOffsetMs = segment.videoStartTimeMs;
      this.outOfBuffer = false;
    }
    this.previousSegmentEndTimeMs = segment.videoStartTimeMs + segment.videoDurationTimeMs;

    // Calculate the time when we'd expect the <video> element to be
    // out of buffered data.
    const currentVideoTimeMs = this.videoElement.currentTime * 1000;
    const outOfBufferMs = this.previousSegmentEndTimeMs - currentVideoTimeMs;
    log.debug(`Expecting <video> element to run out of buffered data in ${outOfBufferMs} ms`);
    clearTimeout(this.outOfBufferTimer);
    this.outOfBufferTimer = setTimeout(this._onOutOfBuffer, outOfBufferMs);

    if (timeOutOfBuffer < MIN_OUT_OF_BUFFER_MS) {
      timeOutOfBuffer = 0;
    }

    requestAnimationFrame(() => this.setState({
      totalBufferedMs: segment.videoStartTimeMs,
      totalOutOfBufferMs: this.state.totalOutOfBufferMs + timeOutOfBuffer,
    }));
  };

  _onReload = () => {
    log.debug('Video element reloaded');

    this._init();

    const reloadCount = this.state.reloadCount;
    requestAnimationFrame(() => this.setState(Object.assign(
      {},
      MSEPlayerWithStats._initialState,
      {
        reloadCount: reloadCount + 1,
      },
    )));
  };

  _onOutOfBuffer = () => {
    log.debug(`Expecting <video> element to be out of buffered data at this point.`);
    this.outOfBuffer = true;
  };

  _renderStats() {
    if (!this.props.showStats) {
      return null;
    }

    const currentVideoTimeMs = this.videoElement.currentTime * 1000;
    const elapsedMs = Date.now() - this.videoStartTimestamp;
    const {
      deviceToClientLagMs,
      totalStalledMs,
      totalBufferedMs,
      totalOutOfBufferMs,
      totalDroppedMs,
      reloadCount,
    } = this.state;
    return (
      <div style={styles.videoStats}>
        <ul style={styles.videoStatsList}>
          <li style={styles.videoStatsItem}>
            Time:<br/>
            {formatMs(elapsedMs)} elapsed<br/>
            {formatMs(currentVideoTimeMs)} {' <video> '}
            ({formatDeltaMs(currentVideoTimeMs - elapsedMs)})
          </li>
          <li style={styles.videoStatsItem}>
            Buffer:<br/>
            {formatMs(totalBufferedMs)} buffered<br/>
            {formatMs(currentVideoTimeMs)} {' <video> '}
            ({formatDeltaMs(currentVideoTimeMs - totalBufferedMs)})
          </li>
          <li style={styles.videoStatsItem}>
            Lag/Stalls/Drops:<br/>
            {formatMs(deviceToClientLagMs)} lag device to client<br/>
            {formatMs(totalStalledMs)} {' <video> '} stalls (Firefox only)<br/>
            {formatMs(totalOutOfBufferMs)} out of buffer<br/>
            {formatMs(totalDroppedMs)} in segments dropped
          </li>
          <li style={styles.videoStatsItem}>
            Reload Count: {reloadCount}
          </li>
        </ul>
      </div>
    );
  }

  _onStalled = (event) => {
    this._onVideoStalledOrResumed(event);
    this.props.onStalled && this.props.onStalled(event);
  };

  _onWaiting = (event) => {
    this._onVideoStalledOrResumed(event);
    this.props.onWaiting && this.props.onWaiting(event);
  };

  _onPlaying = (event) => {
    this._onVideoStalledOrResumed(event);
    this.props.onPlaying && this.props.onPlaying(event);
  };

  render() {
    return (
      <div>
        <MSEPlayer
          ref="player"
          {...this.props}
          onStalled={this._onStalled}
          onWaiting={this._onWaiting}
          onPlaying={this._onPlaying}
          onSegmentEnqueued={this._onSegmentEnqueued}
          onReload={this._onReload}
        />
        {this._renderStats()}
      </div>
    );
  }
}

const styles = {
  videoStats: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoStatsList: {
    margin: 0,
    padding: '0px 8px 8px 8px',
    listStyleType: 'none',
  },
  videoStatsItem: {
    marginTop: 10,
    marginBottom: 10,
  },
};
