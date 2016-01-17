/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * Base class for all device metrics
 *
 * @private
 * @flow
 */

import {Metric} from 'silk-api';
import version from 'silk-core-version';
import {getprop} from '../sysutils';

const deviceType = getprop('ro.product.device');

export default class DeviceMetric extends Metric {
  static INDEX = new Set(['type', 'version']);

  properties: any;
  constructor(props: any) {
    let baseProps = {
      version: version.semver,
      type: deviceType,
    };
    super(Object.assign(baseProps, props));
  }
}
