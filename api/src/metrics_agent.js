/**
 * This module provides an "agent" which will handle progressively more complex
 * logic used to submit metric points to the silk-server. This intenitonally
 * does not include a "timer" mechanism to periodically submit points. This must
 * be done in our individual apps since we must deal with online/offline states.
 *
 * @flow
 */

import createLog from 'silk-log';

import type {default as Metric} from './metric';
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

  _timerId: ?number;
  _online: boolean = false;

  /**
   * All the accumulated points.
   */
  _points: Array<Metric> = [];

  metricsApi: MetricsApi;
  interval: number = 1000 * 60;
  connectivityCheck: ConnectivityCheck;

  constructor(
    metricsApi: MetricsApi,
    connectivityCheck: ConnectivityCheck,
  ) {
    // In theory we could use a circular reference here to silk-api but that is
    // not necessary as we only need this one api.
    this.metricsApi = metricsApi;
    this.connectivityCheck = connectivityCheck;
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
    this.interval = interval;
    this.onConnectivityChange();
    log.info(`Will submit metrics every ${this.interval} ms`);
  }

  stop() {
    log.info(`Stopping metrics submissions`);
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this._online = false;
  }

  add(metric: Metric): void {
    log.info(`Adding one metric to the queue`);
    if (this._points.length > MAX_METRICS) {
      this._points.shift();
    }
    this._points.push(metric);
  }

  async submit(): Promise<void> {
    let points = this._points;
    this._points = [];

    // NOTE: That it is intentional that if this fails we drop metrics.
    log.info(`Submitting ${points.length}`);
    await this.metricsApi.writeMetrics({
      points
    });
  }

  clear() {
    log.info(`Clearing points...`);
    this._points = [];
  }
}
