/**
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

export default class FullScreenVideoLaunch extends Metric {

  static NAME = 'ios_fullscreen_video_launch';
  static DESC = `
    Number of times the user launches fullscreen video
  `;

  constructor() {
    super({
      // XXX: Add dumb value so we can report entirely tags.
      count: new MetricTypes.Integer(1),
    });
  }
}
