/**
 * @flow
 */

import AppMetric from './AppMetric';
import {MetricTypes} from 'silk-api';

export default class LoginMetric extends AppMetric {

  static NAME = 'ios_login';
  static DESC = `
    A login event to an iOS device.
  `;
  static INDEX = new Set([...AppMetric.INDEX]);

  constructor() {
    super({
      // XXX: Add dumb value so we can report entirely tags.
      count: new MetricTypes.Integer(1),
    });
  }
}
