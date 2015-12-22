/**
 * This module deals with the publishing side of creating blobs...
 *
 * @flow
 */
import { Router } from 'express';
import { expressApi } from 'api-schema';
import * as Joi from 'joi';

import authorizeDevice from '../authorize_device';
import TimeMetadata from '../models/time_metadata';

import type { ExpressRoutes } from 'api-schema';
import type { RouteContext } from '../server';

const PREFIX = '/v1/metadata-publisher/';

export default function (ctx: RouteContext): ExpressRoutes {
  let routes = new Router();

  routes.use(PREFIX, authorizeDevice({
    nonce: ctx.nonce,
    devices: ctx.devices
  }));

  let api = expressApi(routes, {
    name: 'metadata_publisher',
    prefix: PREFIX,
    description: `
      Metadata Publishing for video/events
    `,
  });

  api.define({
    path: 'create',
    method: 'post',
    params: [],
    name: 'create',
    description: 'Create metadata',
    output: Joi.object().keys({
      id: Joi.string().required()
    }),
    // Take advantage of the fact we can override a subset of keys...
    input: TimeMetadata.SCHEMA.metadata.keys({
      // XXX: Sorta hack we always override whatever is passed here...
      deviceId: Joi.any()
    })
  }, async (req, res) => {
    let metadata = Object.assign({}, req.body, {
      deviceId: req.publicKey
    });
    let { id } = await ctx.timeMeta.create(metadata);
    res.respond({
      id: id
    });
  });

  api.define({
    path: 'update/:id',
    method: 'post',
    params: [{
      name: 'id',
      description: 'Id of the specific metadata entry to update',
    }],
    name: 'update',
    description: 'Update an existing metadata object',
    output: Joi.object().keys({
      id: Joi.string().required()
    }),
    // Take advantage of the fact we can override a subset of keys...
    input: TimeMetadata.SCHEMA.update,
  }, async (req, res) => {
    let { id } = await ctx.timeMeta.update(req.params.id, req.body);
    res.respond({
      id: id
    });
  });

  return api;
}
