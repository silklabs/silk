/**
 * @flow
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import createLog from 'silk-log';

import prepareSegment from './dash_segment';

import type {SegmentState} from './dash_segment';

export type Segment = {
  offset: number;
  seqno: number;
  buffer: Buffer;
  served: boolean;
};

const log = createLog('segment-provider');
const providerMap = new Map();

let initSegment = null;

export function getInitSegment(): Buffer {
  if (!initSegment) {
    const initSegmentFilename = path.join(
      __dirname,
      '../../../webapp/public/media/default-segment-init.mp4'
    );
    initSegment = fs.readFileSync(initSegmentFilename);
  }
  return initSegment;
}

export default class SegmentProvider extends EventEmitter {

  static get(id: string): ?SegmentProvider {
    return providerMap.get(id);
  }

  _id: string;
  _segments: Array<Segment>;
  _segmentState: SegmentState = {
    seqno: 0,
    startTime: 0,
  };

  constructor(id: string) {
    log.debug(`['${id}']: constructor()`);

    const firstSegment: Segment = {
      offset: 0,
      seqno: -1,
      buffer: getInitSegment(),
      served: false,
    };

    super();

    this._id = id;
    this._segments = [firstSegment];

    providerMap.set(id, this);

    process.nextTick(() => {
      this.emit('init-segment', firstSegment);
    });
  }

  // TODO use this
  close(): void {
    log.debug(`['${this._id}']: close()`);
    this.removeAllListeners();
    providerMap.delete(this._id);
  }

  pushFrame(frame: Buffer): void {
    log.debug(`['${this._id}']: pushFrame(<Buffer ${frame.length}>)`);

    try {
      frame = prepareSegment(frame, this._segmentState);
    } catch(err) {
      log.error(err);
      throw err;
    }

    const prev = this._segments[this._segments.length - 1];
    const segment = {
      offset: prev.offset + prev.buffer.length,
      seqno: this._segmentState.seqno,
      buffer: frame,
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
