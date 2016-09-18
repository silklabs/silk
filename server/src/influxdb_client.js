/**
 * InfluxDB Client
 *
 * While there are many available influxdb clients most are more complex or too
 * basic for our needs. This client aims at doing two things. Submitting
 * points and querying points.
 *
 * @flow
 */

import fetch from 'node-fetch';
import URL from 'url';
import createLog from 'silk-log';

import type {Config as FetchConfig, Response} from 'node-fetch';

export type Point = [
  string, // series
  {[key: string]: string},  // tags
  {[key: string]: string},  // points
  string, // timestamp
];

const log = createLog('influxdb_client');

function formatFields(fields: Object): string {
  let result = [];
  for (let key in fields) {
    let value = fields[key];
    // We intentionally only validate the key and not the value...
    key = key.replace(' ', '\\ ');
    result.push(`${key}=${value}`);
  }
  return result.join(',');
}

export default class InfluxDB {

  user: ?string;
  password: ?string;

  host: string;
  protocol: string;
  db: string;

  /**
   * Note that the url is expected to be in connection string format:
   *
   *  http://user:password@host/db
   *
   */
  constructor(url: string) {
    let parts = URL.parse(url);
    if (!parts) {
      throw new Error('Invalid url passed...');
    }

    let {
      auth,
      host,
      pathname,
      protocol,
    } = parts;

    if (!host || !pathname) {
      throw new Error('Host and db are required');
    }

    this.host = host;
    this.protocol = protocol || 'http';
    this.db = pathname.slice(1);

    if (auth) {
      let [user, pass] = auth.split(':');
      if (user && pass) {
        this.user = user;
        this.password = pass;
      }
    }
  }

  async request(path: string, query: Object, config: FetchConfig): Promise<Response> {
    let headers = Object.assign({}, config.headers);
    if (this.user && this.password) {
      let auth = new Buffer(`${this.user}:${this.password}`).toString('base64');
      headers.authorization = `Basic ${auth}`;
    }

    let fetchConfig = {
      method: config.method || 'GET',
      headers: headers,
      body: config.body,
    };

    let url = URL.format({
      protocol: this.protocol,
      host: this.host,
      pathname: path,
      query: query,
    });

    log.info('request', fetchConfig.method, url);
    let res = await fetch(url, fetchConfig);
    log.info('response', fetchConfig.method, url, res.status);
    return res;
  }

  async ping(): Promise<{version: string}> {
    let res = await this.request('ping', {}, {});
    if (!res.ok) {
      throw new Error(`Failed to ping server: ${res.status}`);
    }

    let version = res.headers.get('X-Influxdb-Version') || 'unknown';
    return { version };
  }

  write(point: Point): Promise<Response> {
    return this.writeAll([point]);
  }

  /**
   * Write all points to influxdb.
   *
   * Note that this method will not tranform number types. All values must be
   * processed into their string form prior to calling this method.
   */
  writeAll(points: Array<Point>): Promise<Response> {
    let body = [];
    for (let point of points) {
      let [series, tags, points, timestamp] = point;

      let tagString = formatFields(tags);
      if (tagString) {
        tagString = `,${tagString}`;
      }

      // For a little while we need to accept metrics without timestamps.
      if (timestamp) {
        timestamp = ` ${timestamp}`;
      } else {
        timestamp = ``;
      }

      body.push(`${series}${tagString} ${formatFields(points)}${timestamp}`);
    }

    log.verbose('writeAll', body);

    return this.request('write', { db: this.db }, {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      body: body.join('\n'),
    });
  }

  /**
   * Usual warnings about query languages apply do not allow abitrary input
   * without a very good reason...
   */
  async query(ql: string): Promise<{results?: Object, error?: string}> {
    log.verbose('query', ql);
    let res = await this.request('query', {
      q: ql.trim(),
      db: this.db,
    }, {});
    return res.json();
  }

}
