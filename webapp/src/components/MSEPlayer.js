/**
 * Play video segments from camera in an HTML video element via the MSE API.
 *
 * For rendering purposes, this element can be treated exactly like
 * the raw `<video>` element. All styles and event handlers are passed
 * through. Call the `feedSegment()` method to provide segments coming
 * in from the camera to the video playback. Use the `videoElement`
 * property to access the underlyhing HTMLVideoElement instance.
 */

import invariant from 'assert';
import React from 'react';
import ReactDOM from 'react-dom';
import { VideoPlayback } from 'silk-cam';
import createLog from 'silk-log';

import type { Segment } from 'silk-cam';

const log = createLog('MSEPlayer');

export default class MSEPlayer extends React.Component {

  videoElement: ?HTMLVideoElement = null;
  mediaSource: MediaSource = new MediaSource();
  sourceBuffer: ?SourceBuffer = null;

  playback: VideoPlayback = new VideoPlayback();
  segmentQ: Array<Segment> = [];

  static propTypes = {
    onSegmentEnqueued: React.PropTypes.func,
  };

  componentDidMount() {
    this.videoElement = ReactDOM.findDOMNode(this.refs.video);
    this.videoElement.src = URL.createObjectURL(this.mediaSource);
  }

  componentWillUnmount() {
    this.mediaSource.removeEventListener('sourceopen', this._feedPlayer);
    if (this.sourceBuffer) {
      this.sourceBuffer.abort();
      this.sourceBuffer.removeEventListener('updateend', this._feedPlayer);
    }
    URL.revokeObjectURL(this.videoElement.src);
  }

  feedSegmentData(segmentData: ArrayBuffer): Segment {
    const segment = this.playback.processSegment(segmentData);
    this.segmentQ.push(segment);
    this._feedPlayer();
    return segment;
  }

  _feedPlayer = (event = null) => {
    if (event) {
      log.debug(`Feeding player after '${event.type}' event.`);
    }

    if (!this.sourceBuffer) {
      if (this.mediaSource.readyState !== 'open') {
        log.debug(`MediaSource is still closed.`);
        this.mediaSource.addEventListener('sourceopen', this._feedPlayer);
        return;
      }

      log.debug(`MediaSource is open.`);
      this.mediaSource.removeEventListener('sourceopen', this._feedPlayer);
      const {videoCodec, audioCodec} = this.playback;
      invariant(videoCodec);
      invariant(audioCodec);
      const contentType = `video/mp4;codecs=${videoCodec},${audioCodec}`;
      log.debug(`Creating SourceBuffer for content type '${contentType}'`);
      this.sourceBuffer = this.mediaSource.addSourceBuffer(contentType);
      this.sourceBuffer.addEventListener('updateend', this._feedPlayer);
    }

    if (this.sourceBuffer.updating) {
      log.debug(`SourceBuffer is still updating.`);
      return;
    }

    log.debug(`Processing segment queue. ${this.segmentQ.length} items in queue.`);
    let index = 0;
    for (; index < this.segmentQ.length; index++) {
      const seg = this.segmentQ[index];
      try {
        log.debug('Appending segment');
        this.sourceBuffer.appendBuffer(seg.byteArray);
        this.props.onSegmentEnqueued && this.props.onSegmentEnqueued(seg);
      } catch(err) {
        if (err.name === 'QuotaExceededError' ||
            err.name === 'InvalidStateError') {
          // Full, bail out and save the rest for later.
          log.warn('SourceBuffer is full, will retry later', err);
          break;
        }
        log.error(err);
        throw err;
      }
    }

    if (index) {
      this.segmentQ.splice(0, index);
    }
  };

  render() {
    return <video ref="video" {...this.props} />;
  }

}
