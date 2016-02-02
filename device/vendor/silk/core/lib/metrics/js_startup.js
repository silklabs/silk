/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

type Props = {
  // How long it takes to load js deps.
  startupMS: MetricTypes.Integer;
}

export default class JSStartup extends Metric {

  static NAME = 'js_startup';
  static DESC = `
    Measures time between when core.js is loaded and when we begin running main.js
  `;

  constructor(props: Props) {
    super(props);
  }
}
