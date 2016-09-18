/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import {Metric} from 'silk-api';

type Props = {
  // Why the restart occurred
  reason: string;
  // Was the capture process restarted
  captureRestart: boolean;
};

export default class CameraRestart extends Metric {

  static NAME = 'camera_restart';
  static DESC = 'Notes when the camera service was restarted';
  static INDEX = new Set(['reason']);

  constructor(props: Props) {
    super(props);
  }
}
