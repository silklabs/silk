/**
 * @flow
 */

import invariant from 'assert';
import {Metric, MetricTypes} from 'silk-api';

export class Network extends Metric {
  static NAME = `video_network_device_to_server`;
  static DESC =
    `"Dark matter", unclassified time, between 'socket.emit(segment)' on the ` +
    `device side and the segment being received ('socket.on(...)') on the ` +
    `server side`;

  constructor(durationMs: number) {
    invariant(durationMs >= 0, `Invalid Network duration ${durationMs}`);
    super({
      durationMs: new MetricTypes.Integer(durationMs),
    });
  }
}
