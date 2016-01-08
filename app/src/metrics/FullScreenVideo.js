/**
 * @flow
 */

import AppMetric from './AppMetric';
import {MetricTypes} from 'silk-api';

export default class FullScreenVideoLaunch extends AppMetric {

  static NAME = 'ios_fullscreen_video_launch';
  static DESC = `
    Number of times the user launches fullscreen video
  `;
  static INDEX = new Set([...AppMetric.INDEX]);

  constructor() {
    super({
      // XXX: Add dumb value so we can report entirely tags.
      count: new MetricTypes.Integer(1),
    });
  }
}
