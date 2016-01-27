/**
 * @flow
 */
import * as Joi from 'joi';
import URL from 'url';
import path from 'path';
import createLog from 'silk-log';
import invariant from 'assert';

import type { ExpressRoutes } from 'api-schema';
import type {RouteContext} from '../server';
import InfluxDB from '../../influxdb_client';

const log = createLog('routes:account');

/**
 * Helper for routes shared between accounts and devices...
 */
export default function(api: ?ExpressRoutes, type: string, ctx: RouteContext) {
  // Semi-nasty hack so we don't need to run this in autogenerate.
  if (!api || !api.define) {
    return;
  }

  /**
   * The base socket.io url must be annotated with some special details in particular:
   *
   *  - encode websocket transport
   *  - encode type of connection (deivce/account)
   *
   * This ensures that the socket.io server has enough information to authenticate.
   */
  let url;
  function getUrl() {
    if (url) {
      return url;
    }
    let parsed = URL.parse(ctx.config.socketio.publicUrl, true);
    parsed.pathname = path.join(parsed.pathname, './');
    delete parsed.search;

    let query = parsed.query || {};
    query.type = type;
    query.EIO = 3;
    query.transport = 'websocket';
    parsed.query = query;

    url = URL.format(parsed);
    return url;
  }

  api.define({
    path: 'socketio/url',
    method: 'post',
    params: [],
    name: 'socketioURL',
    description: 'Get socket.io url for device...',
    output: Joi.object().keys({
      url: Joi.string().required()
    }),
    input: Joi.object()
  }, async (req, res) => {
    res.respond({
      url: getUrl()
    });
  });

  api.define({
    path: 'metrics/point',
    method: 'post',
    params: [],
    name: 'writeMetrics',
    output: Joi.object(),
    // TODO: Allow typing this for documentation without actually validating the
    // input.
    input: Joi.object().keys({
      // Optional until all devices update...
      firstPointTimestamp: Joi.number().integer().greater(0).optional(),
      submissionTimestamp: Joi.number().integer().greater(0).optional(),

      // TODO: Handle "tuple" values. This will allow us to type this better.
      points: Joi.array().items(Joi.any()).required()
    }).required(),
  }, async (req, res) => {
    if (!ctx.influxdb) {
      log.info('Dropping metrics influxdb not configured.');
      res.respond({});
      return;
    }

    let startTime;
    if (req.body.submissionTimestamp) {
      invariant(req.body.points.length);
      invariant(req.body.points[0].length >= 4);

      startTime = Date.now() -
                  req.body.submissionTimestamp +
                  req.body.firstPointTimestamp;
    }

    let influxdb: InfluxDB = ctx.influxdb;

    // XXX: This is potentially lame but we need to validate the series names
    // somehow... Ideally we could do this against a known list of series names
    // but for now we simply prefix it by type.
    let metrics = req.body.points.reduce((final, value) => {
      if (Array.isArray(value)) {
        if (value.length >= 1) {
          // series
          value[0] = `${type}_${value[0]}`;

          if (value.length >= 4) {
            // We should be receiving milliseconds but influxDB wants
            // nanoseconds
            value[3] = `${value[3] + startTime}000000`;
          }
        }
        final.push(value);
      } else {
        log.warn(`Invalid metric`, value);
      }
      return final;
    }, []);

    await influxdb.writeAll(metrics);
    res.respond({});
  });

}
