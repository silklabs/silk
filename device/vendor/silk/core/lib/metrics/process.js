/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import DeviceMetric from './device_metric.js';
import {MetricTypes} from 'silk-api';

class ProcessMetric extends DeviceMetric {
  static INDEX = new Set([`type`, `version`, `processName`]);

  constructor(processName: string, props: any) {
    super(Object.assign({
      processName,
    }, props));
    invariant(processName, `${this.constructor.NAME}: empty processName`);
  }
}
export class ProcessMemory extends ProcessMetric {
  static NAME = `process_memory`;
  static DESC = `The amount of memory used by a process`;

  constructor(
    processName: string,
    vssBytes: number,
    rssBytes: number,
    pssBytes: number,
    ussBytes: number
  ) {
    invariant(vssBytes >= 0, `Invalid vss ${vssBytes}`);
    invariant(rssBytes >= 0, `Invalid rss ${rssBytes}`);
    invariant(pssBytes >= 0, `Invalid pss ${pssBytes}`);
    invariant(ussBytes >= 0, `Invalid uss ${ussBytes}`);

    super(processName, {
      vssBytes: new MetricTypes.Integer(vssBytes),
      rssBytes: new MetricTypes.Integer(rssBytes),
      pssBytes: new MetricTypes.Integer(pssBytes),
      ussBytes: new MetricTypes.Integer(ussBytes),
    });
  }
}

export class OpenFileDescriptors extends ProcessMetric {
  static NAME = `open_file_descriptors`;
  static DESC = `The number of file descriptors `;

  constructor(processName: string, count: number) {
    invariant(count >= 0, `Invalid count ${count}`);
    super(processName, {
      count: new MetricTypes.Integer(count),
    });
  }
}
