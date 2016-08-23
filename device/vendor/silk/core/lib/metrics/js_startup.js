/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

export default class JSStartup extends Metric {

  static NAME = 'js_startup';
  static DESC = `
    Measures time between when core.js is loaded and when we begin running main.js
  `;

  /**
   * @param startupMS How long it takes to load js deps
   * @param bootcompleteMS Time to full boot
   */
  constructor(startupMS: number, bootcompleteMS: number) {
    super({
      startupMS: new MetricTypes.Integer(Math.floor(startupMS)),
      bootcompleteMS: new MetricTypes.Integer(Math.floor(bootcompleteMS)),
    });
  }
}
