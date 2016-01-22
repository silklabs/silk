/**
 * Metrics agent similar to the one used in silk-api but without server
 * availability checks or logic to deal with "offline" cases.
 *
 * @flow
 */

import createLog from 'silk-log';

import type InfluxDBClient from './influxdb_client';
import type Metric from 'silk-api/src/metric';

const log = createLog('server:metrics-agent');

/**
 * Maximum number of points to attempt to submit at once.
 */
const MAX_METRICS = 3000;

/**
 * How often to submit metrics to the influxdb server.
 */
const SUBMIT_INTERVAL = 1000 * 60;

export default class MetricAgent {

  _influxdb: InfluxDBClient;
  _points: Array<Metric> = [];

  start(client: InfluxDBClient) {
    this._influxdb = client;
    this._poll();
  }

  add(metric: Metric) {
    if (!this._influxdb) {
      return;
    }
    if (this._points.length > MAX_METRICS) {
      log.verbose(`Dropping metric... (reached MAX_METRICS)`);
      this._points.shift();
    }
    this._points.push(metric);
  }

  _poll: () => Promise<void> = async() => {
    try {
      if (this._points.length > 0) {
        let points = this._points;
        this._points = [];
        log.info(`Submitting: ${points.length} points`);
        // Cast explicitly from Metric -> Point by running the toJSON function.
        let influxdbPoints = points.map((point) => {
          return point.toJSON();
        });
        await this._influxdb.writeAll(influxdbPoints);
      } else {
        log.info(`No metrics to submit`);
      }
    } catch (err) {
      log.warn('Error submitting metrics', err.stack);
    } finally {
      log.info(`Will submit metrics again in ${SUBMIT_INTERVAL}`);
      setTimeout(this._poll, SUBMIT_INTERVAL);
    }
  };

}
