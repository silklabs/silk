/**
 * Metrics agent similar to the one used in silk-api but without server
 * availability checks or logic to deal with "offline" cases.
 *
 * @flow
 */

import createLog from 'silk-log';

import type InfluxDBClient from './influxdb_client';
import type {default as Metric, Point} from 'silk-api/src/metric';

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
  _points: Array<Point> = [];

  start(client: InfluxDBClient) {
    this._influxdb = client;
    this._poll();
  }

  add(metric: Metric) {
    if (!this._influxdb) {
      return;
    }
    if (this._points.length > MAX_METRICS) {
      const dropped = this._points.shift();
      log.warn(`Dropping metric because we have reached MAX_METRICS ` +
               `(${MAX_METRICS})`,
               dropped);
    }

    log.debug(`Adding metric: ${metric.constructor.NAME}`, metric);

    // Cast explicitly from Metric -> Point by running the toJSON function.
    // InfluxDB wants the timestamp to be in nanoseconds
    const point = metric.toJSON().concat(`${Date.now()}000000`);
    this._points.push(point);
  }

  _poll: () => Promise<void> = async() => {
    try {
      if (this._points.length > 0) {
        const points = this._points;
        this._points = [];
        log.info(`Submitting ${points.length} points`);
        await this._influxdb.writeAll(points);
      } else {
        log.info(`No points to submit`);
      }
    } catch (err) {
      log.warn('Error submitting metrics', err.stack);
    } finally {
      log.info(`Will submit metrics again in ${SUBMIT_INTERVAL}`);
      setTimeout(this._poll, SUBMIT_INTERVAL);
    }
  };

}
