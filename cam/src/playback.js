/**
 * Helper for managing video playback on the client.
 *
 * @flow
 */

import invariant from 'assert';
import { MP4Box } from 'mp4box';
import createLog from 'silk-log';

import { rewriteSegment } from './dash_segment';

const log = createLog('VideoPlayback');

/**
 * Stateful machinery to play back video segments provided by device.
 *
 * This provides the following functionality:
 *
 * - Parse mp4 header from first segment to deduce codecs, time
 *   scales, dimensions, etc. and strip mp4 header from subsequent
 *   segments.
 *
 * - Maintain playback state such as sequence number and elapsed time
 *   and ensure incoming segments from the camera are rewritten
 *   accordingly with that information.
 *
 */
export default class VideoPlayback {

  segmentSeqno: number = 0;
  segmentStartTime: number = 0;

  // These will be filled in as soon as the first video segment is processed.
  timescale: ?number = null;
  audioTimescale: ?number = null;
  audioCodec: ?string = null;
  videoTimescale: ?number = null;
  videoCodec: ?string = null;
  width: ?number = null;
  height: ?number = null;

  _processHeader(buffer: ArrayBuffer) {
    // Parse the MP4 header to get codec and track information.
    let error = null;
    let info = null;
    let mp4box = new MP4Box();
    mp4box.onError = (err) => error = err;
    mp4box.onReady = (moov) => info = moov;
    (buffer: any).fileStart = 0; // MP4Box needs this
    mp4box.appendBuffer(buffer);
    mp4box.flush();

    if (error) {
      log.error(`Error processing mp4 header`, error);
      throw error;
    }
    invariant(info);
    invariant(info.audioTracks.length === 1);
    invariant(info.videoTracks.length === 1);

    this.timescale = info.timescale;
    this.audioTimescale = info.audioTracks[0].timescale;
    this.audioCodec = info.audioTracks[0].codec;
    this.videoTimescale = info.videoTracks[0].timescale;
    this.videoCodec = info.videoTracks[0].codec;
    this.width = info.videoTracks[0].track_width;
    this.height = info.videoTracks[0].track_height;
    log.debug(`Audio codec: ${this.audioCodec}`);
    log.debug(`Video codec: ${this.videoCodec}`);
  }

  /**
   * Prepare an MPEG-DASH segment for playback, e.g. via MSE API in the browser.
   *
   * The array buffer is modified in-place. Returns an array buffer
   * view of the data that can be fed to the video player. Note: this
   * view may be only be a view of a subset of the entire array
   * buffer. Ensure that the consumer of this array buffer view
   * respects that. (Node APIs generally do not and should be
   * converted to `Buffer`s first.)
   */
  processSegment(buffer: ArrayBuffer): ArrayBufferView {
    if (this.segmentSeqno === 0) {
      log.debug(`First segment. Processing mp4 header.`);
      this._processHeader(buffer);
    }

    // Rewrite the segment's sequence number and start time to make it
    // appear it's part of a file with a beginning and an end rather
    // than continuous stream.
    const data = new DataView(buffer);
    const videoStartTime = this.segmentStartTime;
    invariant(this.videoTimescale);
    invariant(this.audioTimescale);
    const audioStartTime = (videoStartTime * this.audioTimescale / this.videoTimescale) | 0;
    const info = rewriteSegment(
      data,
      this.segmentSeqno,
      videoStartTime,
      audioStartTime
    );

    let byteArray;
    if (this.segmentSeqno === 0) {
      byteArray = new Uint8Array(buffer);
    } else {
      // Strip the mp4 init header from all subsequent segments.
      byteArray = new Uint8Array(buffer, info.videoOffset);
    }

    this.segmentSeqno += 1;
    this.segmentStartTime += info.durationTime;

    return byteArray;
  }

}
