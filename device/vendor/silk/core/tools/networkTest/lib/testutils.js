/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'log';
import * as util from './sysutils';

const log = createLog('testUtils');

export class LatencyStats {
  constructor(maxCnt = 1024) {
    this._maxCnt = maxCnt;
    this._latencies = [];
    this._sum = 0;
    this.min = Number.MAX_SAFE_INTEGER;
    this.max = 0;
    this.avg = 0;
    this.cnt = 0;
  }

  start(timeMs) {
    this.cnt++;
    this._lastStartMs = timeMs;
  }

  end(timeMs) {
    let latency = timeMs - this._lastStartMs;

    this.min = Math.min(this.min, latency);
    this.max = Math.max(this.max, latency);
    this._sum += latency;
    this._latencies.push(latency);
    if (this._latencies.length === this._maxCnt) {
      let first = this._latencies.shift();
      this._sum -= first;
    }
    this.avg = this._sum / this._latencies.length;
  }
}

// Helper class to do repeated tests to measure latency
export class Repeater {
  constructor(name, cnt, hz, cfg, work, cleanup = () => {}) {
    this._name = name;
    this._cnt = cnt;
    this._hz = hz;
    this._cfg = cfg;
    this._doWork = work;
    this._doCleanup = cleanup;
    this._stats = new LatencyStats();
  }

  _doNext() {
    if (this._cnt === 0) {
      return this._stats;
    }
    this._cnt--;

    let startMs = Date.now();
    this._stats.start(startMs);

    log.verbose(`starting ${this._name} at ${startMs}`);

    return this._doWork()
    .then(() => {
      let now = Date.now();
      let duration = now - startMs;
      log.verbose(`  finish ${this._name} in ${duration}ms`);
      this._stats.end(now);
    })
    .then(() => this._doCleanup())
    .then(() => {
      // don't wait if this is the last iteration
      if (this._cnt === 0) {
        return;
      }

      // wait before starting next iteration
      let now = Date.now();
      let waitMs = Math.max((startMs + 1000 / this._hz) - now, 0);
      util.timeout(waitMs);
    })
    .then(() => this._doNext())
    .catch(util.processthrow);
  }

  start() {
    return this._doNext();
  }
}
