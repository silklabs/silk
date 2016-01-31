/**
 * @flow
 */

import ServerMetric from './server_metric';
import MetricTypes from 'silk-api/src/metric_types';

export default class StartServerMetric extends ServerMetric {

  static NAME = 'start_server';
  static DESC = `
    Counter for when http server starts...
  `;

  constructor() {
    super({
      count: new MetricTypes.Integer(1)
    });
  }
}
