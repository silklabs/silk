/* @flow */
/**
 * This module deals with the publishing side of creating blobs...
 */
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import authorizeDevice from '../authorize_device';

import { TYPE_ALL as CrashReportTypes } from '../models/crash_metadata';

import type { RouteContext } from '../server';

const PREFIX = '/v1/crash-publisher/';

export default function (ctx: RouteContext) {

  let routes = new Router();

  routes.use(PREFIX, authorizeDevice({
    nonce: ctx.nonce,
    devices: ctx.devices
  }));

  let api = expressApi(routes, {
    name: 'crash_publisher',
    prefix: PREFIX,
    description: `
      Crash Report Publishing
    `,
  });

  api.define({
    path: 'create',
    method: 'post',
    params: [],
    name: 'create',
    description: 'Create the crash metadata',
    output: Joi.object().keys({
      id: Joi.string().required()
    }),
    input: Joi.object().keys({
      timeStamp: Joi.date().iso().required(),
      type: CrashReportTypes.required(),
      url: Joi.string().trim().uri().required()
    }).required()
  }, async (req, res) => {
    let metadata = Object.assign({}, req.body, {
      deviceId: req.publicKey
    });
    let id = await ctx.crashMeta.create(metadata);
    res.respond({
      id: id
    });
  });

  return api;
}
