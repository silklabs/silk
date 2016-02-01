/**
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

export default class LoginMetric extends Metric {

  static NAME = 'ios_login';
  static DESC = `
    A login event to an iOS device.
  `;

  constructor() {
    super({
      // XXX: Add dumb value so we can report entirely tags.
      count: new MetricTypes.Integer(1),
    });
  }
}
