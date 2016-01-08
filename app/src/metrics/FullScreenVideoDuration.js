/**
 * @flow
 */

import AppMetric from './AppMetric';
import {MetricTypes} from 'silk-api';

type Props = {
  durationMs: MetricTypes.Integer;
}

export default class FullScreenVideo extends AppMetric {
  static NAME = 'ios_fullscreen_video_duration';
  static DESC = `
    How long user watched a full screen video view.
  `;
  static INDEX = new Set([...AppMetric.INDEX]);

  props: Props;

  constructor(props: Props) {
    super(props);
  }
}
