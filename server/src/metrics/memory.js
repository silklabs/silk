/**
 * @flow
 */

import invariant from 'assert';
import ServerMetric from './server_metric';
import MetricTypes from 'silk-api/src/metric_types';

import type {ServerType} from '../metrics_agent';

export class Heap extends ServerMetric {

  static NAME = 'process_heap';
  static DESC =
    `The rss of the process and the total and used portion of the v8 heap`;
  static INDEX = new Set([
    'version',
    'branch',
    'serverType',
  ]);

  constructor(
    serverType: ServerType,
    rssBytes: number,
    totalBytes: number,
    usedBytes: number
  ) {
    invariant(serverType, `Invalid serverType '${serverType}'`);
    invariant(rssBytes >= 0, `Invalid rss ${rssBytes}`);
    invariant(totalBytes >= 0, `Invalid total ${totalBytes}`);
    invariant(usedBytes >= 0, `Invalid used ${usedBytes}`);
    super({
      serverType,
      rssBytes: new MetricTypes.Integer(rssBytes),
      totalBytes: new MetricTypes.Integer(totalBytes),
      usedBytes: new MetricTypes.Integer(usedBytes),
    });
  }
}
