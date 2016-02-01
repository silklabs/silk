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

export class Network extends Metric {
  static NAME = `video_network_server_to_app`;
  static DESC =
    `"Dark matter", unclassified time, between 'socket.emit(segment)' on the ` +
    `server side and the segment being received ('socket.on(...)') on the ` +
    `app side`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Network duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}

export class Load extends Metric {
  static NAME = `video_app_load`;
  static DESC =
    `Time spent loading and processing the segment before it's enqueued for ` +
    `playback`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Load duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}

export class Queue extends Metric {
  static NAME = `video_app_queue`;
  static DESC =
    `Time the AV segment spends in the playback queue before being played`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Queue duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}

export class Play extends Metric {
  static NAME = `video_app_play`;
  static DESC =
    `Time the segment is actually being played in the playback widget`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Play duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}

export class Linger extends Metric {
  static NAME = `video_app_linger`;
  static DESC =
    `Time the already-played segment "lingers" in the playback widget ` +
    `because the next segment isn't ready to be played yet`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Linger duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}
