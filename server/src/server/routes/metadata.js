/**
 * This module provides routes to read metadata for accounts.
 *
 * @flow
 */
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import createLog from 'log';

import authorizeAccount from '../authorize_account';
import decorateUrl from '../decorate_url';
import TimeMetadata from '../models/time_metadata';

import type { ExpressRoutes } from 'api-schema';
import type { RouteContext } from '../server';

const PREFIX = '/v1/metadata/';
const EMPTY = Joi.any().only([null]);

const log = createLog('routes:metadata');

// Must contain metadata items but can be an empty array...
const METADATA_ARRAY =
  Joi.array().items(TimeMetadata.SCHEMA.metadata.optional()).required();

// XXX: Use better input types...
function send404OnEmpty(res: any, output: any): void {
  if (!output)  {
    res.sendStatus(404);
    return;
  }
  res.respond(output);
}

export default function (ctx: RouteContext): ExpressRoutes {

  let routes = new Router();

  routes.use(PREFIX, authorizeAccount({
    nonce: ctx.nonce,
    accounts: ctx.accounts
  }));

  /**
   * Ensure the account is only querying devices it owns.
   */
  routes.use(PREFIX, async (req, res, next) => {
    let { deviceId, deviceIds } = req.body;
    if (!deviceId && !deviceIds) {
      next(new Error('Missing deviceId or deviceIds'));
      return;
    }

    if (deviceId && deviceIds) {
      next(new Error('Must send .deviceId OR .deviceIds not both.'));
      return;
    }

    if (!deviceIds) {
      deviceIds = [deviceId];
    }

    let validDevices;
    try {
      validDevices = await ctx.devices.belongsToAccount(
        req.account._id,
        ...deviceIds
      );
    } catch (err) {
      next(err);
      return;
    }

    if (!validDevices) {
      // TODO: Add better checks for when accounts are doing suspicious things.
      // https://github.com/silklabs/silk-server/issues/372
      log.warn(
        `${req.account._id} attempting to access devices it does not own.`,
        deviceIds
      );
      res.sendStatus(401);
      return;
    }

    // Let other routes do their thing...
    next();
  });

  let api = expressApi(routes, {
    name: 'metadata',
    prefix: PREFIX,
    description: `
      Metadata reading methods...
    `,
  });

  api.define({
    path: 'find/near',
    method: 'post',
    name: 'findOneNear',
    description: 'Find metadata id',
    input: TimeMetadata.SCHEMA.findNearTime,
    output: Joi.alternatives().try([
      TimeMetadata.SCHEMA.metadata,
      EMPTY,
    ]),
  }, async (req, res) => {
    let record = await ctx.timeMeta.findNearTime(req.body);
    if (record != null) {
      record = decorateUrl(record);
    }
    // TODO: Validate deviceId against known devices for this account.
    send404OnEmpty(res, record);
  });

  api.define({
    path: 'findall/interval',
    method: 'post',
    name: 'findAllInTimeInterval',
    description: 'Find all metadata entries in a particular time interval',
    input: TimeMetadata.SCHEMA.findAllInTimeInterval,
    output: METADATA_ARRAY,
  }, async (req, res) => {
    let records = await ctx.timeMeta.findAllInTimeInterval(req.body);
    records = records.map(decorateUrl);
    // TODO: Validate deviceId against known devices for this account.
    res.respond(records);
  });

  api.define({
    path: 'find/aftertime',
    method: 'post',
    name: 'findOneAfterTime',
    description: 'Find one metadata entry after given time',
    input: TimeMetadata.SCHEMA.findOneByTime,
    output: Joi.alternatives().try([
      TimeMetadata.SCHEMA.metadata,
      EMPTY,
    ]),
  }, async (req, res) => {
    let record = await ctx.timeMeta.findOneAfterTime(req.body);
    if (record) {
      record = decorateUrl(record);
    }
    // TODO: Validate deviceId against known devices for this account.
    send404OnEmpty(res, record);
  });

  api.define({
    path: 'findall/beforetime',
    method: 'post',
    name: 'findAllBeforeTime',
    description: 'Find all metadata entries in a before a particular time',
    input: TimeMetadata.SCHEMA.findBeforeTime,
    output: METADATA_ARRAY,
  }, async (req, res) => {
    let records = await ctx.timeMeta.findBeforeTime(req.body);
    records.map(decorateUrl);
    // TODO: Validate deviceId against known devices for this account.
    res.respond(records);
  });

  return api;
}
