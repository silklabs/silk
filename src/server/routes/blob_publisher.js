/* @flow */
/**
 * This module deals with the publishing side of creating blobs...
 */
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';
import authorizeDevice from '../authorize_device';

import type { RouteContext } from '../server';

const PREFIX = '/v1/blob-publisher/';

export default function (ctx: RouteContext) {

  let routes = new Router();

  routes.use(PREFIX, authorizeDevice({
    nonce: ctx.nonce,
    devices: ctx.devices
  }));

  let api = expressApi(routes, {
    name: 'blobPublisher',
    prefix: PREFIX,
    description: `
      Blob creation API(s)
    `,
  });

  api.define({
    path: 'ack',
    method: 'post',
    params: [],
    name: 'ack',
    description: 'Acknowledge a blob upload',
    output: Joi.object().keys({
      url: Joi.string().uri()
    }),
    input: Joi.object().keys({
      url: Joi.string().uri()
    }).required()
  }, async (req, res) => {
    await ctx.blobHandler.postAck(req, res);
  });

  api.define({
    path: 'put-url/:type',
    method: 'post',
    params: [
      { name: 'type', description: 'Type of blob.' },
    ],
    name: 'putUrl',
    description: 'Get the blob put url',
    output: Joi.object().keys({
    }),
    input: Joi.object().keys({
      contentLength: Joi.number().required(),
      contentType: Joi.string().required()
    }).required()
  }, async (req, res) => {
    await ctx.blobHandler.postBlob(req, res);
  });

  api.define({
    path: ':type/:id',
    method: 'put',
    params: [
      { name: 'type', description: 'Type of blob.' },
      { name: 'id', description: 'Identifier for blob.' }
    ],
    name: 'putBlob',
    description: 'Put blob (only works for file blobs)',
    output: Joi.object().keys({
      // TODO
    }),
    input: Joi.object().keys({
      // TODO
    }).required()
  }, async (req, res) => {
    if (ctx.config.server.blobType !== 'file') {
      res.sendStatus(501);
      return;
    }
    await ctx.blobHandler.putBlob(req, res);
  });

  return api;
}
