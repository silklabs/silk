/**
 * Crash report reading functionality.
 *
 * @flow
 */
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import authorizeAccount from '../authorize_account';
import createLog from 'log';
import decorateUrl from '../decorate_url';

import CrashMetadata from '../models/crash_metadata';

import type { ExpressRoutes } from 'api-schema';
import type { RouteContext } from '../server';

const log = createLog('routes:crash');
const PREFIX = '/v1/crash/';

/**
 * NOTE: I would like to bake the concept of scopes into api define soon.
 */
const CRASH_SCOPE = 'crash:find';

export default function (ctx: RouteContext): ExpressRoutes {
  let routes = new Router();

  routes.use(PREFIX, authorizeAccount({
    nonce: ctx.nonce,
    accounts: ctx.accounts
  }));

  routes.use(PREFIX, (req, res, next) => {
    let {account} = req;
    let scopes = ctx.scopes.accountScopes(account);
    if (scopes.indexOf(CRASH_SCOPE) === -1) {
      res.sendStatus(401);
      log.warn(
        `Attempted to read crash without proper scope ${account.email}`,
        `given scopes: ${scopes.join(', ')}`
      );
      return;
    }
    next();
  });

  let api = expressApi(routes, {
    name: 'crash',
    prefix: PREFIX,
    description: `
      Crash report reading...
    `,
  });

  api.define({
    path: 'find/:id',
    method: 'post',
    params: [
      { name: 'id', description: 'ID of the crash report to find' },
    ],
    name: 'findById',
    description: 'Query metrics /w influxql',
    // NOTE: This intentionally is identical to the format that influxdb itself
    // returns we make no attempt to transform or change the output.
    output: CrashMetadata.SCHEMA.record.keys({
      id: Joi.string().required()
    }),
    input: Joi.object(),
  }, async (req, res) => {
    let {id} = req.params;
    let result;
    try {
      result = await ctx.crashMeta.get(id);
    } catch(e) {
      res.sendStatus(404);
      return;
    }

    if (result) {
      res.respond(decorateUrl(result));
    } else {
      res.sendStatus(404);
    }
  });

  api.define({
    path: 'find_all',
    method: 'post',
    params: [],
    name: 'findAll',
    description: 'Query metrics /w influxql',
    // NOTE: This intentionally is identical to the format that influxdb itself
    // returns we make no attempt to transform or change the output.
    output: Joi.array().items(CrashMetadata.SCHEMA.record.keys({
      id: Joi.string().required()
    }).optional()),
    input: CrashMetadata.SCHEMA.find,
  }, async (req, res) => {
    let result = await ctx.crashMeta.find(req.body);
    result = result.map(object => decorateUrl(object));
    res.respond(result);
  });

  return api;
}
