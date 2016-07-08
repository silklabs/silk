/**
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

export default class StartServerMetric extends Metric {

  static NAME = 'start_server';
  static DESC = `
    Counter for when http server starts...
  `;

  constructor() {
    super({
      count: new MetricTypes.Integer(1),
    });
  }
}
