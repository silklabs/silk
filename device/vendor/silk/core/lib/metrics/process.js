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

class MemoryMetric extends ProcessMetric {
  constructor(processName: string, bytes: number) {
    super(processName, {
      bytes: new MetricTypes.Integer(bytes),
    });
    invariant(bytes >= 0, `${this.constructor.NAME}: invalid bytes ${bytes}`);
  }
}

export class MemoryVss extends MemoryMetric {
  static NAME = `memory_vss`;
  static DESC = `Virtual Set Size`;

  constructor(processName: string, bytes: number) {
    super(processName, bytes);
  }
}

export class MemoryRss extends MemoryMetric {
  static NAME = `memory_rss`;
  static DESC = `Resident Set Size`;

  constructor(processName: string, bytes: number) {
    super(processName, bytes);
  }
}

export class MemoryPss extends MemoryMetric {
  static NAME = `memory_pss`;
  static DESC = `Proportional Set Size`;

  constructor(processName: string, bytes: number) {
    super(processName, bytes);
  }
}

export class MemoryUss extends MemoryMetric {
  static NAME = `memory_uss`;
  static DESC = `Unique Set Size`;

  constructor(processName: string, bytes: number) {
    super(processName, bytes);
  }
}

export class OpenFileDescriptors extends ProcessMetric {
  static NAME = `open_file_descriptors`;
  static DESC = `The number of file descriptors`;

  constructor(processName: string, count: number) {
    invariant(count >= 0, `Invalid count ${count}`);
    super(processName, {
      count: new MetricTypes.Integer(count),
    });
  }
}

export class MemoryHeap extends ProcessMetric {
  static NAME = `process_heap`;
  static DESC =
    `The rss of the process and the total and used portion of the v8 heap`;

  constructor(
    processName: string,
    rssBytes: number,
    totalBytes: number,
    usedBytes: number
  ) {
    invariant(rssBytes >= 0, `Invalid rss ${rssBytes}`);
    invariant(totalBytes >= 0, `Invalid total ${totalBytes}`);
    invariant(usedBytes >= 0, `Invalid used ${usedBytes}`);
    super(processName, {
      rssBytes: new MetricTypes.Integer(rssBytes),
      totalBytes: new MetricTypes.Integer(totalBytes),
      usedBytes: new MetricTypes.Integer(usedBytes),
    });
  }
}
