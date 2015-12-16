/**
 * This module provides an "agent" which will handle progressively more complex
 * logic used to submit metric points to the silk-server. This intenitonally
 * does not include a "timer" mechanism to periodically submit points. This must
 * be done in our individual apps since we must deal with online/offline states.
 *
 * @flow
 */

 import createLog from 'log';

 import type {default as Metric} from './metric';
 import type AccountApi from './gen/account';
 import type DeviceApi from './gen/device';

 export type MetricsApi = AccountApi | DeviceApi;

 const log = createLog('api:metrics-agent');

 export default class MetricsAgent {

  /**
   * All the accumulated points.
   */
  _points: Array<Metric> = [];
  metricsApi: MetricsApi;

  constructor(metricsApi: MetricsApi) {
    // In theory we could use a circular reference here to silk-api but that is
    // not nessisary as we only need this one api.
    this.metricsApi = metricsApi;
  }

  add(metric: Metric|Array<Metric>): void {
    if (Array.isArray(metric)) {
      log.info(`Adding ${metric.length} to the queue`);
      metric.forEach((point) => this._points.push(point));
    } else {
      log.info(`Adding one metric to the queue`);
      this._points.push(metric);
    }
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
    log.info(`Clearning points...`);
    this._points = [];
  }
}
