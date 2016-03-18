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
  mediaSource: ?MediaSource = null;
  sourceBuffer: ?SourceBuffer = null;
  playback: ?VideoPlayback = null;
  segmentQueue: ?Array<Segment> = null;

  static propTypes = {
    onSegmentEnqueued: React.PropTypes.func,
    onReload: React.PropTypes.func,
  };

  state = {
    videoKey: Date.now().toString(),
  };

  componentDidMount() {
    this.setUpVideoElement();
    this.setUpSegmentQueue();
  }

  componentWillUnmount() {
    this.cleanUpVideoElementAndSegmentQueue();
  }

  setUpVideoElement() {
    this.mediaSource = new MediaSource();
    this.mediaSource.addEventListener('error', this._onError);
    this.videoElement = ReactDOM.findDOMNode(this.refs.video);
    this.videoElement.src = URL.createObjectURL(this.mediaSource);
  }

  setUpSegmentQueue() {
    this.playback = new VideoPlayback();
    this.segmentQueue = [];
  }

  cleanUpVideoElementAndSegmentQueue() {
    this.mediaSource.removeEventListener('sourceopen', this._feedPlayer);
    this.mediaSource.removeEventListener('error', this._onError);

    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener('updateend', this._feedPlayer);
      this.sourceBuffer.removeEventListener('error', this._onError);
      this.sourceBuffer.abort();
    }

    URL.revokeObjectURL(this.videoElement.src);

    this.videoElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.playback = null;
    this.segmentQueue = null;
  }

  feedSegmentData(segmentData: ArrayBuffer): Segment {
    const segment = this.playback.processSegment(segmentData);
    this.segmentQueue.push(segment);
    if (this.videoElement) {
      this._feedPlayer();
    }
    return segment;
  }

  _feedPlayer = (event = null) => {
    invariant(this.videoElement);
    invariant(!this.videoElement.error);
    invariant(this.mediaSource);

    if (event) {
      log.debug(`Feeding player after '${event.type}' event.`);
    }

    if (!this.sourceBuffer) {
      if (this.mediaSource.readyState !== 'open') {
        log.debug('MediaSource is still closed.');
        this.mediaSource.addEventListener('sourceopen', this._feedPlayer);
        return;
      }

      log.debug('MediaSource is open.');
      this.mediaSource.removeEventListener('sourceopen', this._feedPlayer);
      const {videoCodec, audioCodec} = this.playback;
      invariant(videoCodec);
      invariant(audioCodec);
      const contentType = `video/mp4;codecs=${videoCodec},${audioCodec}`;
      log.debug(`Creating SourceBuffer for content type '${contentType}'`);
      this.sourceBuffer = this.mediaSource.addSourceBuffer(contentType);
      this.sourceBuffer.addEventListener('updateend', this._feedPlayer);
      this.sourceBuffer.addEventListener('error', this._onError);
    }

    if (!this.segmentQueue.length) {
      log.debug('Queue is empty.');
      return;
    }

    if (this.sourceBuffer.updating) {
      log.debug('SourceBuffer is still updating, must wait.');
      return;
    }

    log.debug('Appending segment.');
    const segment = this.segmentQueue[0];

    try {
      this.sourceBuffer.appendBuffer(segment.byteArray);
    } catch(err) {
      if (err.name === 'QuotaExceededError' ||
          err.name === 'InvalidStateError') {
        // Full, bail out and save the rest for later.
        log.warn('SourceBuffer is full, will retry later', err);
        return;
      }
      log.error(err);
      throw err;
    }

    this.segmentQueue.shift();

    if (this.props.onSegmentEnqueued) {
      this.props.onSegmentEnqueued(segment);
    }
  };

  _onError = (event) => {
    log.error(`'${event.target.constructor.name}' received an ` +
              `'${event.type}' event`,
              event,
              this.videoElement.error);

    // Throw the video element away and re-render it.
    if (this.videoElement.error) {
      // Clean everything up immediately.
      this.cleanUpVideoElementAndSegmentQueue();

      // Set up the playback and queue before we start the re-render to avoid
      // missing new segments if they come in before the re-render finishes.
      this.setUpSegmentQueue();

      // Re-render.
      this.setState({
        videoKey: Date.now().toString(),
      }, () => {
        // Now get the video element loaded again.
        this.setUpVideoElement();

        // Tell others what happened.
        if (this.props.onReload) {
          this.props.onReload();
        }

        // And finally try to feed any segments that we received during the
        // re-render.
        if (this.segmentQueue.length) {
          this._feedPlayer();
        }
      });
    }

    if (this.props.onError) {
      this.props.onError(event);
    }
  };

  render() {
    return (
      <video
        ref="video"
        key={this.state.videoKey}
        {...this.props}
        onError={this._onError}
      />
    );
  }

}
