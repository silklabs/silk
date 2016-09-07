/**
 * This module provides an "agent" which will handle progressively more complex
 * logic used to submit metric points to the silk-server. This intenitonally
 * does not include a "timer" mechanism to periodically submit points. This must
 * be done in our individual apps since we must deal with online/offline states.
 *
 * @flow
 */

import createLog from 'silk-log';
import invariant from 'assert';
import {sanitizeTagValue} from './metric';

import type {default as Metric, Point, StringToStringDict} from './metric';
import type AccountApi from './gen/account';
import type DeviceApi from './gen/device';

export type MetricsApi = AccountApi | DeviceApi;

type ConnectivityCheck = () => Promise<boolean>;

const log = createLog('api:metrics-agent');

/**
 * If server is offline when availability check is run we still want to continue
 * polling unless specifically ordered not to.
 */
const SERVER_OFFLINE_RECHECK = 1000 * 60;

/**
 * Will hold a maximum of 500 metrics before starting to drop the oldest ones
 * first.
 */
const MAX_METRICS = 500;

/**
 * Default polling interval.
 */
const DEFAULT_POLLING_INTERVAL = 60 * 1000;

export default class MetricsAgent {

  _running: boolean = false;
  _timerId: ?number;
  _online: boolean = false;

  /**
   * All the accumulated points.
   */
  _points: Array<Point> = [];

  /**
   * Timestamp at which first point was added.
   */
  _firstPointTimestamp: number = 0;

  /**
   * The number of metrics that have been dropped since the last submission.
   */
  _droppedCount: number = 0;

  metricsApi: MetricsApi;
  interval: number = 1000 * 60;
  connectivityCheck: ConnectivityCheck;
  _commonTags: StringToStringDict;

  constructor(
    metricsApi: MetricsApi,
    connectivityCheck: ConnectivityCheck,
    commonTags: StringToStringDict,
  ) {
    // In theory we could use a circular reference here to silk-api but that is
    // not necessary as we only need this one api.
    this.metricsApi = metricsApi;
    this.connectivityCheck = connectivityCheck;

    this._commonTags = Object.keys(commonTags).reduce((result, propName) => {
      result[propName] = sanitizeTagValue(commonTags[propName]);
      return result;
    }, {});
  }

  onConnectivityChange: () => Promise<void> = async () => {
    this._online = await this.connectivityCheck();
    if (this._online) {
      log.info('Can reach the server!');
      this._poll();
    } else {
      log.warn('Server is unreachable');
      setTimeout(this.onConnectivityChange, SERVER_OFFLINE_RECHECK);
    }
  };

  _poll: () => Promise<void> = async () => {
    try {
      this._timerId = null;
      await this.submit();
    } catch (err) {
      log.error('Error submitting metrics', err.message, err.stack);
    }

    if (this._online) {
      log.info(`Will submit metrics again in ${this.interval} ms`);
      this._timerId = setTimeout(this._poll, this.interval);
    }
  };

  start(interval?: number = DEFAULT_POLLING_INTERVAL): void {
    this._running = true;
    this.interval = interval;
    this.onConnectivityChange();
    log.info(`Will submit metrics every ${this.interval} ms`);
  }

  stop() {
    log.info('Stopping metrics submissions');
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this._online = false;
    this._running = false;
  }

  add(metric: Metric): void {
    if (!this._running) {
      return;
    }

    const now = Date.now();

    let timeOffset = 0;
    if (this._points.length) {
      timeOffset = now - this._firstPointTimestamp;
      if (this._points.length > MAX_METRICS) {
        this._droppedCount++;
        const dropped = this._points.shift();
        log.warn('Dropping metric because we have reached MAX_METRICS ' +
                 `(${MAX_METRICS})`,
                 dropped);
      }
    } else {
      this._firstPointTimestamp = now;
    }

    log.debug(`Adding metric: ${metric.constructor.NAME}`, metric);

    const [name, tags, measurements] = metric.serialize(this._commonTags);
    const point = [name, tags, measurements, timeOffset];
    this._points.push(point);
  }

  async submit(): Promise<void> {
    const firstPointTimestamp = this._firstPointTimestamp;
    if (!firstPointTimestamp) {
      invariant(!this._points.length);
      log.info('No points to submit');
      return;
    }

    this._firstPointTimestamp = 0;

    const points = this._points;
    this._points = [];

    invariant(points.length);

    const droppedCount = this._droppedCount;
    this._droppedCount = 0;

    // NOTE: That it is intentional that if this fails we drop metrics.
    log.info(`Submitting ${points.length} points`);
    await this.metricsApi.writeMetrics({
      firstPointTimestamp,
      submissionTimestamp: Date.now(),
      droppedCount,
      points
    });
  }

  clear() {
    log.info('Clearing points');
    this._firstPointTimestamp = 0;
    this._droppedCount = 0;
    if (this._points.length) {
      this._points = [];
    }
  }
}
