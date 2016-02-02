/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import {Metric, MetricTypes} from 'silk-api';

export class Record extends Metric {
  static NAME = `video_device_record`;
  static DESC = `Time between AV segment recording start / stop`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Record duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}

export class CaptureToNode extends Metric {
  static NAME = `video_device_capture_to_node`;
  static DESC =
    `Time between segment enqueued in 'capture' process to be sent over ` +
    `socket, up to segment enqueued for server upload in silk-core process ` +
    `by 'socket.emit(segment)'`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid CaptureToNode duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}

export class Dropped extends Metric {
  static NAME = `video_device_dropped`;
  static DESC =
    `Segment was dropped on the floor because too many server acks became ` +
    `pending`;

  constructor() {
    super({
      count: new MetricTypes.Integer(1),
    });
  }
}

export class Network extends Metric {
  static NAME = `video_network_server_to_device`;
  static DESC =
    `"Dark matter", unclassified time, between 'socket.emit(segment)' on the ` +
    `device and the ack from the server being received on the device`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Network duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}
