/**
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

type Props = {
  durationMs: MetricTypes.Integer;
};

export default class FullScreenVideo extends Metric {
  static NAME = 'ios_fullscreen_video_duration';
  static DESC = `
    How long user watched a full screen video view.
  `;

  constructor(props: Props) {
    super(props);
  }
}
