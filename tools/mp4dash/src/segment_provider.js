import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import createLog from 'log';

import prepareSegment from './dash_segment';

const log = createLog('segment-provider');

//const PRETEND_VIDEO_DURATION_MS = 5000;

export default class SegmentProvider extends EventEmitter {

  static _initSegment = null;
  static getInitSegment(): Buffer {
    if (SegmentProvider._initSegment === null) {
      let initSegmentFilename = path.join(
        __dirname,
        '../../../webapp/public/media/default-segment-init.mp4'
      );
      SegmentProvider._initSegment = fs.readFileSync(initSegmentFilename);
      //let durationOffset = 0x2c + 4/*size*/ + 4/*fourcc*/ + 4/*version+flags*/ +
      //    4/*creation*/ + 4/*modification*/ + 4/*timescale*/;
      //_initSegment.writeInt32BE(PRETEND_VIDEO_DURATION_MS, durationOffset);
    }
    return SegmentProvider._initSegment;
  }

  static _streams = {};
  static get(socket, deviceId): LiveVideoStream {
    let stream = SegmentProvider._streams[deviceId];
    if (stream) {
      return stream;
    }
    stream = SegmentProvider._streams[deviceId] = new SegmentProvider(socket, deviceId);
    return stream;
  }

  constructor(socket, deviceId) {
    log.info(`SegmentProvider(${deviceId})`);

    super();
    this.socket = socket;
    this.deviceId = deviceId;

    this.segments = [{
      offset: 0,
      seqno: -1,
      buffer: SegmentProvider.getInitSegment(),
      served: false,
    }];

    let stream = `video-${deviceId}`;
    socket.on(stream, this.onDeviceVideoSegment);
    socket.emit('join', stream);
  }

  // TODO use this
  close() {
    let stream = `video-${deviceId}`;
    this.socket.removeListener(stream, this.onDeviceVideoSegment);
    this.removeAllListeners();
    delete SegmentProvider._streams[this.deviceId];
  }

  segmentState = {
    seqno: 0,
    startTime: 0,
  };

  onDeviceVideoSegment = (message) => {
    log.info(`onDeviceVideoSegment(${message.frame.length})`);
    let prevSegment = this.segments[this.segments.length - 1];
    let segment = {
      offset: prevSegment.offset + prevSegment.buffer.length,
      seqno: this.segmentState.seqno,
      buffer: prepareSegment(message.frame, this.segmentState),
      served: false,
    };
    this.segments.push(segment);
    this.emit('segment', segment);
  };

  findSegmentClosestToOffset(offset) {
    log.info(`findSegmentClosestToOffset(${offset})`);
    let i = 0;
    while (i + 1 < this.segments.length && this.segments[i + 1].offset <= offset) {
      i += 1;
    }
    log.info(`  found segment at ${this.segments[i].offset}`);
    return this.segments[i];
  }
}
