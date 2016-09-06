/**
 * @flow
 */

import EventEmitter from 'events';
import createLog from 'silk-log';
import { VideoPlayback } from 'silk-cam';

export type Segment = {
  offset: number;
  seqno: number;
  buffer: Buffer;
  served: boolean;
};

const log = createLog('segment-provider');
const providerMap = new Map();

export default class SegmentProvider extends EventEmitter {

  static get(id: string): ?SegmentProvider {
    return providerMap.get(id);
  }

  _id: string;
  _segments: Array<Segment> = [];
  _playback: VideoPlayback = new VideoPlayback();

  constructor(id: string) {
    log.debug(`['${id}']: constructor()`);
    super();
    providerMap.set(id, this);
    this._id = id;
  }

  // TODO use this
  close(): void {
    log.debug(`['${this._id}']: close()`);
    this.removeAllListeners();
    providerMap.delete(this._id);
  }

  pushFrame(buffer: Buffer): void {
    log.debug(`['${this._id}']: pushFrame(<Buffer ${buffer.length}>)`);

    // Flow doesn't know that Buffer inherits from Uint8Array, so re-cast
    // it here to make Flow happy about accessing Uint8Array properties.
    // See also https://github.com/facebook/flow/issues/1514.
    let bufferAsUint8Array: Uint8Array = (buffer: any);
    let arrayBuffer = bufferAsUint8Array.buffer.slice(
      bufferAsUint8Array.byteOffset,
      bufferAsUint8Array.byteOffset + bufferAsUint8Array.byteLength
    );
    let byteArray;
    try {
      byteArray = this._playback.processSegment(arrayBuffer);
    } catch (err) {
      log.error(err);
      throw err;
    }

    let offset = 0;
    const prev = this._segments[this._segments.length - 1];
    if (prev) {
      offset = prev.offset + prev.buffer.length;
    }
    const segment = {
      offset,
      seqno: this._playback.segmentSeqno,
      buffer: new Buffer((byteArray: any)),
      served: false,
    };
    this._segments.push(segment);
    this.emit('segment', segment);
  }

  findSegmentClosestToOffset(offset: number): Segment {
    let i = 0;
    while (i + 1 < this._segments.length &&
           this._segments[i + 1].offset <= offset) {
      i += 1;
    }
    log.debug(`['${this._id}']: findSegmentClosestToOffset(${offset}) -> ` +
              `${this._segments[i].offset}`);
    return this._segments[i];
  }
}
